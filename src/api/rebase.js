import '../typedefs.js'
import { GitCommit } from '../models/GitCommit.js'
import { GitRefManager } from '../managers/GitRefManager.js'
import { FileSystem } from '../models/FileSystem.js'
import { _readObject as readObject } from '../storage/readObject.js'
import { _writeObject as writeObject } from '../storage/writeObject.js'
import { assertParameter } from '../utils/assertParameter.js'
import { discoverGitdir } from '../utils/discoverGitdir.js'
import { join } from '../utils/join.js'
import { appendReflog } from '../utils/appendReflog.js'

/**
 * Rebase API — reapply commits on top of a new base.
 *
 * Supports: init, next, commit, finish, abort, and a convenience 'rebase' op
 * that performs the entire rebase non-interactively.
 *
 * Equivalent to libgit2's `git_rebase_*` family of functions.
 *
 * @param {object} args
 * @param {FsClient} args.fs - a file system client
 * @param {string} args.dir - The working tree directory path
 * @param {string} [args.gitdir=join(dir,'.git')] - The git directory path
 * @param {'init'|'next'|'commit'|'finish'|'abort'|'rebase'} [args.op='rebase'] - Operation
 * @param {string} [args.onto] - The commit/ref to rebase onto (for init/rebase)
 * @param {string} [args.upstream] - The upstream ref (for init/rebase); commits between upstream and HEAD are rebased
 * @param {string} [args.ref] - The branch to rebase (defaults to current branch)
 * @param {object} [args.author] - Author info for rebased commits
 * @param {object} [args.committer] - Committer info for rebased commits
 * @param {object} [args.cache] - a cache object
 * @returns {Promise<{oid?: string, done?: boolean, conflicts?: string[]}>}
 *
 * @example
 * // Rebase current branch onto main
 * const result = await git.rebase({ fs, dir, onto: 'main' })
 * console.log(result.oid) // new HEAD oid
 */
export async function rebase({
  fs: _fs,
  dir,
  gitdir = join(dir, '.git'),
  op = 'rebase',
  onto,
  upstream,
  ref,
  author,
  committer,
  cache = {},
}) {
  try {
    assertParameter('fs', _fs)
    assertParameter('dir', dir)

    const fs = new FileSystem(_fs)
    gitdir = await discoverGitdir({ fsp: fs, dotgit: gitdir })

    switch (op) {
      case 'init':
        return await rebaseInit({ fs, gitdir, cache, onto, upstream, ref })
      case 'next':
        return await rebaseNext({ fs, dir, gitdir, cache, author, committer })
      case 'commit':
        return await rebaseCommit({ fs, dir, gitdir, cache, author, committer })
      case 'finish':
        return await rebaseFinish({ fs, gitdir, cache, author })
      case 'abort':
        return await rebaseAbort({ fs, dir, gitdir, cache })
      case 'rebase':
        return await rebaseFull({ fs, dir, gitdir, cache, onto, upstream, ref, author, committer })
      default:
        throw new Error(`Unknown rebase operation: ${op}`)
    }
  } catch (err) {
    err.caller = 'git.rebase'
    throw err
  }
}

// ─── State helpers ──────────────────────────────────────────────────

const REBASE_DIR = 'rebase-merge'

async function readState(fs, gitdir) {
  const stateDir = join(gitdir, REBASE_DIR)
  try {
    const buf = await fs.read(join(stateDir, 'state.json'))
    return JSON.parse(Buffer.from(buf).toString('utf8'))
  } catch {
    return null
  }
}

async function writeState(fs, gitdir, state) {
  const stateDir = join(gitdir, REBASE_DIR)
  try { await fs.mkdir(stateDir) } catch { /* exists */ }
  await fs.write(
    join(stateDir, 'state.json'),
    JSON.stringify(state, null, 2),
    'utf8'
  )
}

async function cleanState(fs, gitdir) {
  const stateDir = join(gitdir, REBASE_DIR)
  try {
    const files = await fs.readdir(stateDir)
    for (const f of files) {
      await fs.rm(join(stateDir, f))
    }
    await fs.rmdir(stateDir)
  } catch { /* ignore */ }
}

// ─── Operations ─────────────────────────────────────────────────────

/**
 * Initialize a rebase: save state, compute todo list.
 */
async function rebaseInit({ fs, gitdir, cache, onto, upstream, ref }) {
  assertParameter('onto', onto)

  // Resolve onto to OID
  const ontoOid = await GitRefManager.resolve({ fs, gitdir, ref: onto })

  // Resolve the branch being rebased
  let headRef
  if (ref) {
    headRef = ref.startsWith('refs/') ? ref : `refs/heads/${ref}`
  } else {
    headRef = await resolveHEADRef(fs, gitdir)
  }
  const headOid = await GitRefManager.resolve({ fs, gitdir, ref: headRef })

  // Resolve upstream (defaults to onto)
  const upstreamOid = upstream
    ? await GitRefManager.resolve({ fs, gitdir, ref: upstream })
    : ontoOid

  // Collect commits to rebase: walk from HEAD back until we reach upstream
  const todo = await collectCommits({ fs, cache, gitdir, from: headOid, until: upstreamOid })

  const state = {
    headRef,
    origHead: headOid,
    ontoOid,
    upstreamOid,
    todo, // OIDs in order (oldest first)
    done: [],
    current: 0,
  }

  await writeState(fs, gitdir, state)

  return { done: false, remaining: todo.length }
}

/**
 * Apply the next commit in the rebase todo list via cherry-pick.
 */
async function rebaseNext({ fs, dir, gitdir, cache, author, committer }) {
  const state = await readState(fs, gitdir)
  if (!state) throw new Error('No rebase in progress')
  if (state.current >= state.todo.length) {
    return { done: true }
  }

  const commitOid = state.todo[state.current]

  // Cherry-pick this commit onto current HEAD
  const { _cherryPick } = await import('../commands/cherryPick.js')
  try {
    const result = await _cherryPick({
      fs,
      cache,
      dir,
      gitdir,
      ours: 'HEAD',
      theirs: commitOid,
      author,
      committer,
    })

    state.done.push({ original: commitOid, rebased: result.oid })
    state.current++
    await writeState(fs, gitdir, state)

    // Update HEAD
    await GitRefManager.writeRef({ fs, gitdir, ref: 'HEAD', value: result.oid })

    return {
      done: state.current >= state.todo.length,
      oid: result.oid,
      original: commitOid,
    }
  } catch (err) {
    // Conflict — save state and let user resolve
    state.conflictCommit = commitOid
    await writeState(fs, gitdir, state)
    throw err
  }
}

/**
 * After resolving conflicts, create the rebased commit.
 */
async function rebaseCommit({ fs, dir, gitdir, cache, author, committer }) {
  const state = await readState(fs, gitdir)
  if (!state || !state.conflictCommit) {
    throw new Error('No rebase conflict to resolve')
  }

  // Read the original commit message
  const { object } = await readObject({ fs, cache, gitdir, oid: state.conflictCommit })
  const commit = GitCommit.from(object)
  const headers = commit.parseHeaders()
  const message = commit.message()

  // Create commit from current index state
  const { _commit } = await import('../commands/commit.js')
  const headOid = await GitRefManager.resolve({ fs, gitdir, ref: 'HEAD' })
  const oid = await _commit({
    fs, cache, gitdir,
    message,
    author: author || headers.author,
    committer: committer || headers.committer,
    parent: [headOid],
  })

  state.done.push({ original: state.conflictCommit, rebased: oid })
  state.current++
  delete state.conflictCommit
  await writeState(fs, gitdir, state)

  await GitRefManager.writeRef({ fs, gitdir, ref: 'HEAD', value: oid })

  return {
    done: state.current >= state.todo.length,
    oid,
    original: state.conflictCommit,
  }
}

/**
 * Finish the rebase: update the branch ref to point to the new HEAD.
 */
async function rebaseFinish({ fs, gitdir, cache, author }) {
  const state = await readState(fs, gitdir)
  if (!state) throw new Error('No rebase in progress')

  const headOid = await GitRefManager.resolve({ fs, gitdir, ref: 'HEAD' })

  // Update the original branch ref
  await GitRefManager.writeRef({ fs, gitdir, ref: state.headRef, value: headOid })

  // Write reflog entry
  if (author) {
    await appendReflog({
      fs, gitdir,
      ref: state.headRef,
      previousOid: state.origHead,
      oid: headOid,
      author,
      message: `rebase finished: ${state.headRef} onto ${state.ontoOid.slice(0, 7)}`,
    })
  }

  // Clean up
  await cleanState(fs, gitdir)

  return { oid: headOid, done: true }
}

/**
 * Abort the rebase: restore original HEAD and clean up.
 */
async function rebaseAbort({ fs, dir, gitdir, cache }) {
  const state = await readState(fs, gitdir)
  if (!state) throw new Error('No rebase in progress')

  // Restore HEAD to original
  await GitRefManager.writeRef({ fs, gitdir, ref: 'HEAD', value: state.origHead })
  await GitRefManager.writeRef({ fs, gitdir, ref: state.headRef, value: state.origHead })

  // Checkout to restore working directory
  const { _checkout } = await import('../commands/checkout.js')
  await _checkout({
    fs, cache, dir, gitdir,
    ref: state.headRef.replace('refs/heads/', ''),
    force: true,
  })

  await cleanState(fs, gitdir)

  return { oid: state.origHead, aborted: true }
}

/**
 * Perform a full non-interactive rebase.
 */
async function rebaseFull({ fs, dir, gitdir, cache, onto, upstream, ref, author, committer }) {
  // Initialize
  await rebaseInit({ fs, gitdir, cache, onto, upstream, ref })

  const state = await readState(fs, gitdir)
  if (!state || state.todo.length === 0) {
    await cleanState(fs, gitdir)
    const headOid = await GitRefManager.resolve({ fs, gitdir, ref: 'HEAD' })
    return { oid: headOid, done: true }
  }

  // Detach HEAD at onto
  await GitRefManager.writeRef({ fs, gitdir, ref: 'HEAD', value: state.ontoOid })

  // Checkout onto
  const { _checkout } = await import('../commands/checkout.js')
  await _checkout({
    fs, cache, dir, gitdir,
    ref: state.ontoOid,
    force: true,
    noUpdateHead: true,
  })

  // Apply each commit
  let lastOid
  for (let i = 0; i < state.todo.length; i++) {
    const result = await rebaseNext({ fs, dir, gitdir, cache, author, committer })
    lastOid = result.oid
  }

  // Finish
  return await rebaseFinish({ fs, gitdir, cache, author })
}

// ─── Helpers ────────────────────────────────────────────────────────

async function resolveHEADRef(fs, gitdir) {
  const headContent = await fs.read(join(gitdir, 'HEAD'))
  const headStr = Buffer.from(headContent).toString('utf8').trim()
  if (headStr.startsWith('ref: ')) {
    return headStr.slice(5)
  }
  throw new Error('HEAD is detached — specify a ref to rebase')
}

/**
 * Collect commits from `from` back to (but not including) `until`.
 * Returns OIDs in oldest-first order.
 */
async function collectCommits({ fs, cache, gitdir, from, until }) {
  const commits = []
  let current = from
  const MAX_DEPTH = 10000

  for (let i = 0; i < MAX_DEPTH; i++) {
    if (current === until) break

    commits.push(current)

    const { object } = await readObject({ fs, cache, gitdir, oid: current })
    const commit = GitCommit.from(object)
    const { parent } = commit.parseHeaders()

    if (parent.length === 0) break
    current = parent[0] // Follow first parent
  }

  // Reverse to get oldest-first order
  commits.reverse()
  return commits
}
