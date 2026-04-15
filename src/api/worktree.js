// @ts-check
import '../typedefs.js'

import { GitRefManager } from '../managers/GitRefManager.js'
import { FileSystem } from '../models/FileSystem.js'
import { assertParameter } from '../utils/assertParameter.js'
import { discoverGitdir } from '../utils/discoverGitdir.js'
import { join } from '../utils/join.js'

/**
 * List linked working trees for a repository.
 * Equivalent to libgit2's `git_worktree_list`.
 *
 * @param {object} args
 * @param {FsClient} args.fs - a file system client
 * @param {string} [args.dir] - The working tree directory path
 * @param {string} [args.gitdir=join(dir, '.git')] - The git directory path
 * @returns {Promise<string[]>} Array of worktree names
 */
export async function worktreeList({
  fs: _fs,
  dir,
  gitdir = join(dir, '.git'),
}) {
  try {
    assertParameter('fs', _fs)
    assertParameter('gitdir', gitdir)
    const fs = new FileSystem(_fs)
    const updatedGitdir = await discoverGitdir({ fsp: fs, dotgit: gitdir })

    const worktreesDir = join(updatedGitdir, 'worktrees')
    try {
      const entries = await fs.readdir(worktreesDir)
      // Filter to only directories that contain a gitdir file
      const names = []
      for (const entry of entries) {
        const gitdirFile = join(worktreesDir, entry, 'gitdir')
        if (await fs.exists(gitdirFile)) {
          names.push(entry)
        }
      }
      return names
    } catch (e) {
      // No worktrees directory — no linked worktrees
      return []
    }
  } catch (err) {
    err.caller = 'git.worktreeList'
    throw err
  }
}

/**
 * Add a new linked working tree.
 * Equivalent to libgit2's `git_worktree_add`.
 *
 * Creates a new working tree linked to the repository at the given path.
 * Sets up the required data structures (.git/worktrees/<name>/) and
 * creates a .git file in the working tree pointing back.
 *
 * @param {object} args
 * @param {FsClient} args.fs - a file system client
 * @param {string} [args.dir] - The main working tree directory path
 * @param {string} [args.gitdir=join(dir, '.git')] - The git directory path
 * @param {string} args.name - Name for the worktree
 * @param {string} args.path - Filesystem path for the new working tree
 * @param {string} [args.ref] - Branch or commit to check out (default: new branch named after worktree)
 * @param {boolean} [args.lock=false] - Lock the worktree after creation
 * @returns {Promise<void>}
 */
export async function worktreeAdd({
  fs: _fs,
  dir,
  gitdir = join(dir, '.git'),
  name,
  path: worktreePath,
  ref,
  lock = false,
}) {
  try {
    assertParameter('fs', _fs)
    assertParameter('gitdir', gitdir)
    assertParameter('name', name)
    assertParameter('path', worktreePath)
    const fs = new FileSystem(_fs)
    const updatedGitdir = await discoverGitdir({ fsp: fs, dotgit: gitdir })

    // Create the worktree directory in .git/worktrees/<name>
    const wtGitDir = join(updatedGitdir, 'worktrees', name)
    await fs.mkdir(join(updatedGitdir, 'worktrees'), { recursive: true })
    await fs.mkdir(wtGitDir, { recursive: true })

    // Create the working directory
    await fs.mkdir(worktreePath, { recursive: true })

    // Resolve the ref for HEAD
    let headRef = ref
    if (!headRef) {
      // Create a new branch named after the worktree
      const headOid = await GitRefManager.resolve({ fs, gitdir: updatedGitdir, ref: 'HEAD' })
      await GitRefManager.writeRef({
        fs,
        gitdir: updatedGitdir,
        ref: `refs/heads/${name}`,
        value: headOid,
      })
      headRef = `refs/heads/${name}`
    }

    // Resolve to an OID
    const oid = await GitRefManager.resolve({ fs, gitdir: updatedGitdir, ref: headRef })

    // Write .git/worktrees/<name>/gitdir — points to the working tree's .git file
    await fs.write(join(wtGitDir, 'gitdir'), join(worktreePath, '.git') + '\n')

    // Write .git/worktrees/<name>/HEAD
    if (headRef.startsWith('refs/')) {
      await fs.write(join(wtGitDir, 'HEAD'), `ref: ${headRef}\n`)
    } else {
      await fs.write(join(wtGitDir, 'HEAD'), oid + '\n')
    }

    // Write .git/worktrees/<name>/commondir — relative path back to main gitdir
    await fs.write(join(wtGitDir, 'commondir'), '../..\n')

    // Create .git file in the working tree pointing to the worktree gitdir
    await fs.write(join(worktreePath, '.git'), `gitdir: ${wtGitDir}\n`)

    // Lock if requested
    if (lock) {
      await fs.write(join(wtGitDir, 'locked'), '')
    }
  } catch (err) {
    err.caller = 'git.worktreeAdd'
    throw err
  }
}

/**
 * Lock a worktree.
 * Equivalent to libgit2's `git_worktree_lock`.
 *
 * @param {object} args
 * @param {FsClient} args.fs - a file system client
 * @param {string} [args.dir] - The working tree directory path
 * @param {string} [args.gitdir=join(dir, '.git')] - The git directory path
 * @param {string} args.name - Worktree name
 * @param {string} [args.reason=''] - Reason for locking
 * @returns {Promise<void>}
 */
export async function worktreeLock({
  fs: _fs,
  dir,
  gitdir = join(dir, '.git'),
  name,
  reason = '',
}) {
  try {
    assertParameter('fs', _fs)
    assertParameter('gitdir', gitdir)
    assertParameter('name', name)
    const fs = new FileSystem(_fs)
    const updatedGitdir = await discoverGitdir({ fsp: fs, dotgit: gitdir })

    const lockFile = join(updatedGitdir, 'worktrees', name, 'locked')
    await fs.write(lockFile, reason)
  } catch (err) {
    err.caller = 'git.worktreeLock'
    throw err
  }
}

/**
 * Unlock a worktree.
 * Equivalent to libgit2's `git_worktree_unlock`.
 *
 * @param {object} args
 * @param {FsClient} args.fs - a file system client
 * @param {string} [args.dir] - The working tree directory path
 * @param {string} [args.gitdir=join(dir, '.git')] - The git directory path
 * @param {string} args.name - Worktree name
 * @returns {Promise<void>}
 */
export async function worktreeUnlock({
  fs: _fs,
  dir,
  gitdir = join(dir, '.git'),
  name,
}) {
  try {
    assertParameter('fs', _fs)
    assertParameter('gitdir', gitdir)
    assertParameter('name', name)
    const fs = new FileSystem(_fs)
    const updatedGitdir = await discoverGitdir({ fsp: fs, dotgit: gitdir })

    await fs.rm(join(updatedGitdir, 'worktrees', name, 'locked'))
  } catch (err) {
    err.caller = 'git.worktreeUnlock'
    throw err
  }
}

/**
 * Check if a worktree is locked.
 * Equivalent to libgit2's `git_worktree_is_locked`.
 *
 * @param {object} args
 * @param {FsClient} args.fs - a file system client
 * @param {string} [args.dir] - The working tree directory path
 * @param {string} [args.gitdir=join(dir, '.git')] - The git directory path
 * @param {string} args.name - Worktree name
 * @returns {Promise<{locked: boolean, reason: string|null}>}
 */
export async function worktreeIsLocked({
  fs: _fs,
  dir,
  gitdir = join(dir, '.git'),
  name,
}) {
  try {
    assertParameter('fs', _fs)
    assertParameter('gitdir', gitdir)
    assertParameter('name', name)
    const fs = new FileSystem(_fs)
    const updatedGitdir = await discoverGitdir({ fsp: fs, dotgit: gitdir })

    const lockFile = join(updatedGitdir, 'worktrees', name, 'locked')
    const content = await fs.read(lockFile, { encoding: 'utf8' })
    if (content === null) return { locked: false, reason: null }
    return { locked: true, reason: content.trim() || null }
  } catch (err) {
    err.caller = 'git.worktreeIsLocked'
    throw err
  }
}

/**
 * Prune (remove) a worktree's data structures.
 * Equivalent to libgit2's `git_worktree_prune`.
 *
 * Removes the .git/worktrees/<name> directory. By default, refuses
 * to prune a valid or locked worktree unless overridden by flags.
 *
 * @param {object} args
 * @param {FsClient} args.fs - a file system client
 * @param {string} [args.dir] - The working tree directory path
 * @param {string} [args.gitdir=join(dir, '.git')] - The git directory path
 * @param {string} args.name - Worktree name to prune
 * @param {boolean} [args.force=false] - Prune even if valid
 * @param {boolean} [args.pruneLocked=false] - Prune even if locked
 * @returns {Promise<void>}
 */
export async function worktreePrune({
  fs: _fs,
  dir,
  gitdir = join(dir, '.git'),
  name,
  force = false,
  pruneLocked = false,
}) {
  try {
    assertParameter('fs', _fs)
    assertParameter('gitdir', gitdir)
    assertParameter('name', name)
    const fs = new FileSystem(_fs)
    const updatedGitdir = await discoverGitdir({ fsp: fs, dotgit: gitdir })

    const wtGitDir = join(updatedGitdir, 'worktrees', name)

    // Check if it exists
    if (!(await fs.exists(wtGitDir))) {
      throw new Error(`Worktree '${name}' not found`)
    }

    // Check if locked
    if (!pruneLocked) {
      const lockFile = join(wtGitDir, 'locked')
      const lockContent = await fs.read(lockFile, { encoding: 'utf8' })
      if (lockContent !== null) {
        throw new Error(`Worktree '${name}' is locked`)
      }
    }

    // Check if valid (gitdir points to an existing path) unless force
    if (!force) {
      const gitdirContent = await fs.read(join(wtGitDir, 'gitdir'), { encoding: 'utf8' })
      if (gitdirContent) {
        const wtGitFile = gitdirContent.trim()
        if (await fs.exists(wtGitFile)) {
          throw new Error(`Worktree '${name}' is still valid. Use force to prune anyway.`)
        }
      }
    }

    // Remove all files in the worktree gitdir
    const entries = await fs.readdir(wtGitDir)
    for (const entry of entries) {
      await fs.rm(join(wtGitDir, entry))
    }
    await fs.rmdir(wtGitDir)
  } catch (err) {
    err.caller = 'git.worktreePrune'
    throw err
  }
}
