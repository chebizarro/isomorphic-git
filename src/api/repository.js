// @ts-check
import '../typedefs.js'

import { FileSystem } from '../models/FileSystem.js'
import { GitRefManager } from '../managers/GitRefManager.js'
import { GitConfigManager } from '../managers/GitConfigManager.js'
import { assertParameter } from '../utils/assertParameter.js'
import { discoverGitdir } from '../utils/discoverGitdir.js'
import { join } from '../utils/join.js'

/**
 * Repository states corresponding to libgit2's git_repository_state_t.
 * Indicates what operation (if any) is currently in progress.
 */
export const REPOSITORY_STATE = Object.freeze({
  NONE: 0,
  MERGE: 1,
  REVERT: 2,
  REVERT_SEQUENCE: 3,
  CHERRYPICK: 4,
  CHERRYPICK_SEQUENCE: 5,
  BISECT: 6,
  REBASE: 7,
  REBASE_INTERACTIVE: 8,
  REBASE_MERGE: 9,
  APPLY_MAILBOX: 10,
  APPLY_MAILBOX_OR_REBASE: 11,
})

/**
 * Detect the current repository state — whether an operation like merge,
 * rebase, cherry-pick, etc. is in progress. Equivalent to libgit2's
 * `git_repository_state`.
 *
 * @param {object} args
 * @param {FsClient} args.fs - a file system client
 * @param {string} [args.dir] - The working tree directory path
 * @param {string} [args.gitdir=join(dir, '.git')] - The git directory path
 * @returns {Promise<number>} One of the REPOSITORY_STATE values
 */
export async function repositoryState({
  fs: _fs,
  dir,
  gitdir = join(dir, '.git'),
}) {
  try {
    assertParameter('fs', _fs)
    assertParameter('gitdir', gitdir)
    const fs = new FileSystem(_fs)
    const updatedGitdir = await discoverGitdir({ fsp: fs, dotgit: gitdir })

    // Check state files in priority order (most specific first)
    // libgit2 checks: rebase-apply/applying, rebase-apply/rebasing,
    // rebase-apply, rebase-merge/interactive, rebase-merge,
    // CHERRY_PICK_HEAD (+sequencer), REVERT_HEAD (+sequencer),
    // MERGE_HEAD, BISECT_LOG

    if (await fileExists(fs, updatedGitdir, 'rebase-apply')) {
      if (await fileExists(fs, updatedGitdir, 'rebase-apply/applying')) {
        return REPOSITORY_STATE.APPLY_MAILBOX
      }
      if (await fileExists(fs, updatedGitdir, 'rebase-apply/rebasing')) {
        return REPOSITORY_STATE.REBASE
      }
      return REPOSITORY_STATE.APPLY_MAILBOX_OR_REBASE
    }

    if (await fileExists(fs, updatedGitdir, 'rebase-merge')) {
      if (await fileExists(fs, updatedGitdir, 'rebase-merge/interactive')) {
        return REPOSITORY_STATE.REBASE_INTERACTIVE
      }
      return REPOSITORY_STATE.REBASE_MERGE
    }

    // Our custom rebase stores state in rebase-merge/state.json
    if (await fileExists(fs, updatedGitdir, 'rebase-merge/state.json')) {
      return REPOSITORY_STATE.REBASE_MERGE
    }

    if (await fileExists(fs, updatedGitdir, 'CHERRY_PICK_HEAD')) {
      if (await fileExists(fs, updatedGitdir, 'sequencer')) {
        return REPOSITORY_STATE.CHERRYPICK_SEQUENCE
      }
      return REPOSITORY_STATE.CHERRYPICK
    }

    if (await fileExists(fs, updatedGitdir, 'REVERT_HEAD')) {
      if (await fileExists(fs, updatedGitdir, 'sequencer')) {
        return REPOSITORY_STATE.REVERT_SEQUENCE
      }
      return REPOSITORY_STATE.REVERT
    }

    if (await fileExists(fs, updatedGitdir, 'MERGE_HEAD')) {
      return REPOSITORY_STATE.MERGE
    }

    if (await fileExists(fs, updatedGitdir, 'BISECT_LOG')) {
      return REPOSITORY_STATE.BISECT
    }

    return REPOSITORY_STATE.NONE
  } catch (err) {
    err.caller = 'git.repositoryState'
    throw err
  }
}

/**
 * Clean up the repository state files, finishing any in-progress operation.
 * Equivalent to libgit2's `git_repository_state_cleanup`.
 *
 * @param {object} args
 * @param {FsClient} args.fs - a file system client
 * @param {string} [args.dir] - The working tree directory path
 * @param {string} [args.gitdir=join(dir, '.git')] - The git directory path
 * @returns {Promise<void>}
 */
export async function repositoryStateCleanup({
  fs: _fs,
  dir,
  gitdir = join(dir, '.git'),
}) {
  try {
    assertParameter('fs', _fs)
    assertParameter('gitdir', gitdir)
    const fs = new FileSystem(_fs)
    const updatedGitdir = await discoverGitdir({ fsp: fs, dotgit: gitdir })

    const stateFiles = [
      'MERGE_HEAD',
      'MERGE_MSG',
      'MERGE_MODE',
      'CHERRY_PICK_HEAD',
      'REVERT_HEAD',
      'BISECT_LOG',
    ]

    const stateDirs = [
      'rebase-merge',
      'rebase-apply',
      'sequencer',
    ]

    for (const file of stateFiles) {
      await safeUnlink(fs, join(updatedGitdir, file))
    }

    for (const d of stateDirs) {
      await removeDir(fs, join(updatedGitdir, d))
    }
  } catch (err) {
    err.caller = 'git.repositoryStateCleanup'
    throw err
  }
}

/**
 * Check if the repository is bare (no working directory).
 *
 * @param {object} args
 * @param {FsClient} args.fs - a file system client
 * @param {string} [args.dir] - The working tree directory path
 * @param {string} [args.gitdir=join(dir, '.git')] - The git directory path
 * @returns {Promise<boolean>}
 */
export async function isBare({
  fs: _fs,
  dir,
  gitdir = join(dir, '.git'),
}) {
  try {
    assertParameter('fs', _fs)
    assertParameter('gitdir', gitdir)
    const fs = new FileSystem(_fs)
    const updatedGitdir = await discoverGitdir({ fsp: fs, dotgit: gitdir })

    const config = await GitConfigManager.get({ fs, gitdir: updatedGitdir })
    const bare = await config.get('core.bare')
    if (bare !== undefined) return bare === 'true' || bare === true

    // Fallback: if gitdir === dir, it's likely bare
    return updatedGitdir === dir
  } catch (err) {
    err.caller = 'git.isBare'
    throw err
  }
}

/**
 * Check if the repository is empty (no commits on HEAD).
 *
 * @param {object} args
 * @param {FsClient} args.fs - a file system client
 * @param {string} [args.dir] - The working tree directory path
 * @param {string} [args.gitdir=join(dir, '.git')] - The git directory path
 * @returns {Promise<boolean>}
 */
export async function isEmpty({
  fs: _fs,
  dir,
  gitdir = join(dir, '.git'),
}) {
  try {
    assertParameter('fs', _fs)
    assertParameter('gitdir', gitdir)
    const fs = new FileSystem(_fs)
    const updatedGitdir = await discoverGitdir({ fsp: fs, dotgit: gitdir })

    // Read HEAD directly — if it's a symbolic ref, check if the target ref exists
    const head = await fs.read(join(updatedGitdir, 'HEAD'), { encoding: 'utf8' })
    if (!head) return true
    const trimmed = head.trim()

    // Detached HEAD pointing to an OID — not empty
    if (/^[0-9a-f]{40}$/.test(trimmed)) return false

    // Symbolic ref — check if the target branch exists
    if (trimmed.startsWith('ref:')) {
      const ref = trimmed.slice(4).trim()
      // Check if the ref file exists (loose ref)
      if (await fs.exists(join(updatedGitdir, ref))) return false
      // Check packed-refs
      try {
        const packed = await fs.read(join(updatedGitdir, 'packed-refs'), { encoding: 'utf8' })
        if (packed && packed.includes(ref)) return false
      } catch (e) {
        // no packed-refs
      }
      return true
    }

    return true
  } catch (err) {
    err.caller = 'git.isEmpty'
    throw err
  }
}

/**
 * Check if the repository is a shallow clone.
 *
 * @param {object} args
 * @param {FsClient} args.fs - a file system client
 * @param {string} [args.dir] - The working tree directory path
 * @param {string} [args.gitdir=join(dir, '.git')] - The git directory path
 * @returns {Promise<boolean>}
 */
export async function isShallow({
  fs: _fs,
  dir,
  gitdir = join(dir, '.git'),
}) {
  try {
    assertParameter('fs', _fs)
    assertParameter('gitdir', gitdir)
    const fs = new FileSystem(_fs)
    const updatedGitdir = await discoverGitdir({ fsp: fs, dotgit: gitdir })

    try {
      const shallow = await fs.read(join(updatedGitdir, 'shallow'), { encoding: 'utf8' })
      return shallow !== null && shallow.trim().length > 0
    } catch (e) {
      return false
    }
  } catch (err) {
    err.caller = 'git.isShallow'
    throw err
  }
}

/**
 * Check if HEAD is detached (points directly to an OID, not a branch).
 *
 * @param {object} args
 * @param {FsClient} args.fs - a file system client
 * @param {string} [args.dir] - The working tree directory path
 * @param {string} [args.gitdir=join(dir, '.git')] - The git directory path
 * @returns {Promise<boolean>}
 */
export async function isHeadDetached({
  fs: _fs,
  dir,
  gitdir = join(dir, '.git'),
}) {
  try {
    assertParameter('fs', _fs)
    assertParameter('gitdir', gitdir)
    const fs = new FileSystem(_fs)
    const updatedGitdir = await discoverGitdir({ fsp: fs, dotgit: gitdir })

    const head = await fs.read(join(updatedGitdir, 'HEAD'), { encoding: 'utf8' })
    if (head === null) return false
    return !head.trim().startsWith('ref:')
  } catch (err) {
    err.caller = 'git.isHeadDetached'
    throw err
  }
}

/**
 * Check if HEAD points to an unborn branch (a symbolic ref to a branch that
 * doesn't exist yet — typical of a freshly initialized repo).
 *
 * @param {object} args
 * @param {FsClient} args.fs - a file system client
 * @param {string} [args.dir] - The working tree directory path
 * @param {string} [args.gitdir=join(dir, '.git')] - The git directory path
 * @returns {Promise<boolean>}
 */
export async function isHeadUnborn({
  fs: _fs,
  dir,
  gitdir = join(dir, '.git'),
}) {
  try {
    assertParameter('fs', _fs)
    assertParameter('gitdir', gitdir)
    const fs = new FileSystem(_fs)
    const updatedGitdir = await discoverGitdir({ fsp: fs, dotgit: gitdir })

    const head = await fs.read(join(updatedGitdir, 'HEAD'), { encoding: 'utf8' })
    if (head === null) return true
    const trimmed = head.trim()
    if (!trimmed.startsWith('ref:')) return false

    // HEAD points to a symbolic ref — check if that ref exists
    const ref = trimmed.slice(4).trim()
    try {
      await GitRefManager.resolve({ fs, gitdir: updatedGitdir, ref })
      return false
    } catch (e) {
      return true
    }
  } catch (err) {
    err.caller = 'git.isHeadUnborn'
    throw err
  }
}

// ---- helpers ----

async function fileExists(fs, gitdir, relpath) {
  return fs.exists(join(gitdir, relpath))
}

async function safeUnlink(fs, filepath) {
  try {
    await fs.rm(filepath)
  } catch (e) {
    // ignore — file may not exist
  }
}

async function removeDir(fs, dirpath) {
  // Recursively delete: list children, delete files, then rmdir
  try {
    const entries = await fs.readdir(dirpath)
    if (entries) {
      for (const entry of entries) {
        const entryPath = join(dirpath, entry)
        // Try rm as file first
        try {
          await fs.rm(entryPath)
        } catch (e) {
          // Might be a directory
          await removeDir(fs, entryPath)
        }
      }
    }
    await fs.rmdir(dirpath)
  } catch (e) {
    // directory doesn't exist — that's fine
  }
}
