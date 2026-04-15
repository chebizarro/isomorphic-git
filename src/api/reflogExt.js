// @ts-check
import '../typedefs.js'

import { FileSystem } from '../models/FileSystem.js'
import { assertParameter } from '../utils/assertParameter.js'
import { discoverGitdir } from '../utils/discoverGitdir.js'
import { join } from '../utils/join.js'

/**
 * Delete an entire reflog for a ref.
 * Equivalent to libgit2's `git_reflog_delete`.
 *
 * @param {object} args
 * @param {FsClient} args.fs - a file system client
 * @param {string} [args.dir] - The working tree directory path
 * @param {string} [args.gitdir=join(dir, '.git')] - The git directory path
 * @param {string} args.ref - The ref whose reflog to delete
 * @returns {Promise<void>}
 */
export async function deleteReflog({
  fs: _fs,
  dir,
  gitdir = join(dir, '.git'),
  ref,
}) {
  try {
    assertParameter('fs', _fs)
    assertParameter('gitdir', gitdir)
    assertParameter('ref', ref)
    const fs = new FileSystem(_fs)
    const updatedGitdir = await discoverGitdir({ fsp: fs, dotgit: gitdir })
    await fs.rm(join(updatedGitdir, 'logs', ref))
  } catch (err) {
    err.caller = 'git.deleteReflog'
    throw err
  }
}

/**
 * Drop a specific entry from a reflog by index.
 * Equivalent to libgit2's `git_reflog_drop`.
 *
 * @param {object} args
 * @param {FsClient} args.fs - a file system client
 * @param {string} [args.dir] - The working tree directory path
 * @param {string} [args.gitdir=join(dir, '.git')] - The git directory path
 * @param {string} args.ref - The ref name
 * @param {number} args.index - The entry index to drop (0 = newest)
 * @returns {Promise<void>}
 */
export async function dropReflogEntry({
  fs: _fs,
  dir,
  gitdir = join(dir, '.git'),
  ref,
  index: idx,
}) {
  try {
    assertParameter('fs', _fs)
    assertParameter('gitdir', gitdir)
    assertParameter('ref', ref)
    assertParameter('index', idx)
    const fs = new FileSystem(_fs)
    const updatedGitdir = await discoverGitdir({ fsp: fs, dotgit: gitdir })

    const logPath = join(updatedGitdir, 'logs', ref)
    const content = await fs.read(logPath, { encoding: 'utf8' })
    if (!content) return

    const lines = content.trim().split('\n')
    // Reflog is stored oldest-first, but index 0 = newest
    const reverseIdx = lines.length - 1 - idx
    if (reverseIdx < 0 || reverseIdx >= lines.length) return

    lines.splice(reverseIdx, 1)
    await fs.write(logPath, lines.join('\n') + '\n')
  } catch (err) {
    err.caller = 'git.dropReflogEntry'
    throw err
  }
}

/**
 * Rename a reflog (used when renaming a branch).
 * Equivalent to libgit2's `git_reflog_rename`.
 *
 * @param {object} args
 * @param {FsClient} args.fs - a file system client
 * @param {string} [args.dir] - The working tree directory path
 * @param {string} [args.gitdir=join(dir, '.git')] - The git directory path
 * @param {string} args.oldRef - Old ref name
 * @param {string} args.newRef - New ref name
 * @returns {Promise<void>}
 */
export async function renameReflog({
  fs: _fs,
  dir,
  gitdir = join(dir, '.git'),
  oldRef,
  newRef,
}) {
  try {
    assertParameter('fs', _fs)
    assertParameter('gitdir', gitdir)
    assertParameter('oldRef', oldRef)
    assertParameter('newRef', newRef)
    const fs = new FileSystem(_fs)
    const updatedGitdir = await discoverGitdir({ fsp: fs, dotgit: gitdir })

    const oldPath = join(updatedGitdir, 'logs', oldRef)
    const newPath = join(updatedGitdir, 'logs', newRef)

    const content = await fs.read(oldPath, { encoding: 'utf8' })
    if (!content) return

    // Ensure parent directory exists
    const newDir = newPath.slice(0, newPath.lastIndexOf('/'))
    try { await fs.mkdir(newDir) } catch (e) { /* exists */ }

    await fs.write(newPath, content)
    await fs.rm(oldPath)
  } catch (err) {
    err.caller = 'git.renameReflog'
    throw err
  }
}
