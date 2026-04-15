// @ts-check
import '../typedefs.js'

import { FileSystem } from '../models/FileSystem.js'
import { assertParameter } from '../utils/assertParameter.js'
import { discoverGitdir } from '../utils/discoverGitdir.js'
import { join } from '../utils/join.js'

/**
 * Get the list of shallow commit OIDs.
 * Equivalent to libgit2's `git_repository_is_shallow` + reading shallow roots.
 *
 * @param {object} args
 * @param {FsClient} args.fs - a file system client
 * @param {string} [args.dir] - The working tree directory path
 * @param {string} [args.gitdir=join(dir, '.git')] - The git directory path
 * @returns {Promise<string[]>} Array of shallow commit OIDs
 */
export async function listShallowRoots({
  fs: _fs,
  dir,
  gitdir = join(dir, '.git'),
}) {
  try {
    assertParameter('fs', _fs)
    assertParameter('gitdir', gitdir)
    const fs = new FileSystem(_fs)
    const updatedGitdir = await discoverGitdir({ fsp: fs, dotgit: gitdir })

    const content = await fs.read(join(updatedGitdir, 'shallow'), { encoding: 'utf8' })
    if (!content) return []

    return content.trim().split('\n').filter(line => /^[0-9a-f]{40}$/.test(line.trim())).map(l => l.trim())
  } catch (err) {
    err.caller = 'git.listShallowRoots'
    throw err
  }
}

/**
 * Deepen or unshallow the repository by removing entries from the shallow file.
 *
 * @param {object} args
 * @param {FsClient} args.fs - a file system client
 * @param {string} [args.dir] - The working tree directory path
 * @param {string} [args.gitdir=join(dir, '.git')] - The git directory path
 * @param {string[]} [args.oids] - Specific OIDs to remove from shallow list. If omitted, removes all (unshallow).
 * @returns {Promise<void>}
 */
export async function unshallow({
  fs: _fs,
  dir,
  gitdir = join(dir, '.git'),
  oids,
}) {
  try {
    assertParameter('fs', _fs)
    assertParameter('gitdir', gitdir)
    const fs = new FileSystem(_fs)
    const updatedGitdir = await discoverGitdir({ fsp: fs, dotgit: gitdir })

    if (!oids) {
      // Remove the entire shallow file
      await fs.rm(join(updatedGitdir, 'shallow'))
      return
    }

    const content = await fs.read(join(updatedGitdir, 'shallow'), { encoding: 'utf8' })
    if (!content) return

    const removeSet = new Set(oids)
    const remaining = content.trim().split('\n')
      .map(l => l.trim())
      .filter(l => l && !removeSet.has(l))

    if (remaining.length === 0) {
      await fs.rm(join(updatedGitdir, 'shallow'))
    } else {
      await fs.write(join(updatedGitdir, 'shallow'), remaining.join('\n') + '\n')
    }
  } catch (err) {
    err.caller = 'git.unshallow'
    throw err
  }
}
