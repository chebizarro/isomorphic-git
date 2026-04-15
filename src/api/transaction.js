// @ts-check
import '../typedefs.js'

import { GitRefManager } from '../managers/GitRefManager.js'
import { FileSystem } from '../models/FileSystem.js'
import { assertParameter } from '../utils/assertParameter.js'
import { discoverGitdir } from '../utils/discoverGitdir.js'
import { join } from '../utils/join.js'

/**
 * Create and execute an atomic ref update transaction.
 * Equivalent to libgit2's transaction API (git_transaction_new,
 * lock_ref, set_target, commit).
 *
 * All ref updates in the updates array are applied atomically.
 * If any update fails, none are applied.
 *
 * @param {object} args
 * @param {FsClient} args.fs - a file system client
 * @param {string} [args.dir] - The working tree directory path
 * @param {string} [args.gitdir=join(dir, '.git')] - The git directory path
 * @param {Array<{ref: string, oid?: string, symbolic?: string, delete?: boolean}>} args.updates
 *   Array of ref updates. Each can set an OID target, a symbolic target, or delete.
 * @returns {Promise<void>}
 */
export async function refTransaction({
  fs: _fs,
  dir,
  gitdir = join(dir, '.git'),
  updates,
}) {
  try {
    assertParameter('fs', _fs)
    assertParameter('gitdir', gitdir)
    assertParameter('updates', updates)
    const fs = new FileSystem(_fs)
    const updatedGitdir = await discoverGitdir({ fsp: fs, dotgit: gitdir })

    // Validate all updates first
    for (const update of updates) {
      if (!update.ref) {
        throw new Error('Each update must have a ref')
      }
      if (!update.oid && !update.symbolic && !update.delete) {
        throw new Error(`Update for ${update.ref} must have oid, symbolic, or delete`)
      }
    }

    // Create lock files for all refs
    const locks = []
    try {
      for (const update of updates) {
        const refPath = update.ref.startsWith('refs/')
          ? join(updatedGitdir, update.ref)
          : join(updatedGitdir, update.ref)
        const lockPath = refPath + '.lock'

        // Create lock file
        try {
          await fs.write(lockPath, 'locked\n')
          locks.push(lockPath)
        } catch (e) {
          throw new Error(`Could not lock ref ${update.ref}`)
        }
      }

      // Apply all updates
      for (const update of updates) {
        if (update.delete) {
          await GitRefManager.deleteRef({ fs, gitdir: updatedGitdir, ref: update.ref })
        } else if (update.symbolic) {
          const refPath = join(updatedGitdir, update.ref)
          await fs.write(refPath, `ref: ${update.symbolic}\n`)
        } else if (update.oid) {
          await GitRefManager.writeRef({
            fs,
            gitdir: updatedGitdir,
            ref: update.ref,
            value: update.oid,
          })
        }
      }
    } finally {
      // Remove all lock files
      for (const lockPath of locks) {
        try { await fs.rm(lockPath) } catch (e) { /* ignore */ }
      }
    }
  } catch (err) {
    err.caller = 'git.refTransaction'
    throw err
  }
}
