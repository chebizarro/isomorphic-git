import '../typedefs.js'
import { GitCommit } from '../models/GitCommit.js'
import { GitRefManager } from '../managers/GitRefManager.js'
import { FileSystem } from '../models/FileSystem.js'
import { _readObject as readObject } from '../storage/readObject.js'
import { assertParameter } from '../utils/assertParameter.js'
import { discoverGitdir } from '../utils/discoverGitdir.js'
import { join } from '../utils/join.js'

/**
 * Parse a revision string and resolve it to an OID.
 *
 * Supports a subset of gitrevisions(7) syntax:
 * - Ref names: `HEAD`, `main`, `refs/heads/main`, `v1.0.0`
 * - Ancestor: `HEAD~3`, `main~1`
 * - Parent: `HEAD^`, `HEAD^2` (for merge commits)
 * - Combined: `HEAD~2^2`
 *
 * This is equivalent to libgit2's `git_revparse_single`.
 *
 * @param {object} args
 * @param {FsClient} args.fs - a file system client
 * @param {string} [args.dir] - The working tree directory path
 * @param {string} [args.gitdir=join(dir,'.git')] - The git directory path
 * @param {string} args.spec - The revision string to parse
 * @param {object} [args.cache] - a cache object
 * @returns {Promise<string>} The resolved OID
 *
 * @example
 * const oid = await git.revparse({ fs, dir, spec: 'HEAD~3' })
 * console.log(oid)
 */
export async function revparse({
  fs: _fs,
  dir,
  gitdir = join(dir, '.git'),
  spec,
  cache = {},
}) {
  assertParameter('fs', _fs)
  assertParameter('spec', spec)

  const fs = new FileSystem(_fs)
  gitdir = await discoverGitdir({ fsp: fs, dotgit: gitdir })

  // Tokenize the spec: split into ref part and suffix operators (~N, ^N)
  // E.g. "HEAD~3^2" → ref="HEAD", ops=[{type:'~', n:3}, {type:'^', n:2}]
  const { ref, ops } = parseSpec(spec)

  // Resolve the base ref to an OID
  let oid = await GitRefManager.resolve({ fs, gitdir, ref })

  // Peel to commit if needed (in case ref points to a tag)
  oid = await peelToCommit({ fs, cache, gitdir, oid })

  // Apply operators
  for (const op of ops) {
    if (op.type === '~') {
      // Walk N first-parents
      for (let i = 0; i < op.n; i++) {
        const { object } = await readObject({ fs, cache, gitdir, oid })
        const commit = GitCommit.from(object)
        const { parent } = commit.parseHeaders()
        if (parent.length === 0) {
          throw new Error(
            `Cannot resolve '${spec}': commit ${oid} has no parent (reached root)`
          )
        }
        oid = parent[0]
      }
    } else if (op.type === '^') {
      if (op.n === 0) {
        // ^0 means "peel to commit" — already done
        continue
      }
      const { object } = await readObject({ fs, cache, gitdir, oid })
      const commit = GitCommit.from(object)
      const { parent } = commit.parseHeaders()
      const idx = op.n - 1
      if (idx >= parent.length) {
        throw new Error(
          `Cannot resolve '${spec}': commit ${oid} does not have parent ${op.n} (has ${parent.length} parents)`
        )
      }
      oid = parent[idx]
    }
  }

  return oid
}

/**
 * Parse a revision spec string into a ref and a list of operators.
 */
function parseSpec(spec) {
  const ops = []
  let i = 0

  // Find where operators start
  let refEnd = spec.length
  for (let j = 0; j < spec.length; j++) {
    if (spec[j] === '~' || spec[j] === '^') {
      refEnd = j
      break
    }
  }

  const ref = spec.slice(0, refEnd)
  if (!ref) {
    throw new Error(`Invalid revision spec: '${spec}'`)
  }

  i = refEnd
  while (i < spec.length) {
    const ch = spec[i]
    if (ch === '~') {
      i++
      let n = 0
      let hasDigit = false
      while (i < spec.length && spec[i] >= '0' && spec[i] <= '9') {
        n = n * 10 + (spec.charCodeAt(i) - 48)
        hasDigit = true
        i++
      }
      ops.push({ type: '~', n: hasDigit ? n : 1 })
    } else if (ch === '^') {
      i++
      let n = 0
      let hasDigit = false
      while (i < spec.length && spec[i] >= '0' && spec[i] <= '9') {
        n = n * 10 + (spec.charCodeAt(i) - 48)
        hasDigit = true
        i++
      }
      ops.push({ type: '^', n: hasDigit ? n : 1 })
    } else {
      throw new Error(
        `Invalid character '${ch}' in revision spec '${spec}' at position ${i}`
      )
    }
  }

  return { ref, ops }
}

/**
 * Peel through annotated tags to find the underlying commit OID.
 */
async function peelToCommit({ fs, cache, gitdir, oid }) {
  let currentOid = oid
  for (let depth = 0; depth < 100; depth++) {
    const { type, object } = await readObject({
      fs,
      cache,
      gitdir,
      oid: currentOid,
    })
    if (type === 'commit') return currentOid
    if (type === 'tag') {
      // Parse tag to find target
      const content =
        typeof object === 'string' ? object : Buffer.from(object).toString()
      const match = content.match(/^object ([0-9a-f]{40})/m)
      if (match) {
        currentOid = match[1]
        continue
      }
    }
    throw new Error(
      `Cannot peel object ${oid} (type '${type}') to a commit`
    )
  }
  throw new Error(`Too many levels of tag indirection while peeling ${oid}`)
}
