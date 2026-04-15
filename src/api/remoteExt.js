// @ts-check
import '../typedefs.js'

import { GitConfigManager } from '../managers/GitConfigManager.js'
import { GitRefManager } from '../managers/GitRefManager.js'
import { FileSystem } from '../models/FileSystem.js'
import { assertParameter } from '../utils/assertParameter.js'
import { discoverGitdir } from '../utils/discoverGitdir.js'
import { join } from '../utils/join.js'

/**
 * Rename a remote.
 * Equivalent to libgit2's `git_remote_rename`.
 *
 * @param {object} args
 * @param {FsClient} args.fs - a file system client
 * @param {string} [args.dir] - The working tree directory path
 * @param {string} [args.gitdir=join(dir, '.git')] - The git directory path
 * @param {string} args.oldName - Current remote name
 * @param {string} args.newName - New remote name
 * @returns {Promise<void>}
 */
export async function renameRemote({
  fs: _fs,
  dir,
  gitdir = join(dir, '.git'),
  oldName,
  newName,
}) {
  try {
    assertParameter('fs', _fs)
    assertParameter('gitdir', gitdir)
    assertParameter('oldName', oldName)
    assertParameter('newName', newName)
    const fs = new FileSystem(_fs)
    const updatedGitdir = await discoverGitdir({ fsp: fs, dotgit: gitdir })

    const config = await GitConfigManager.get({ fs, gitdir: updatedGitdir })

    // Copy old remote config to new name
    const url = await config.get(`remote.${oldName}.url`)
    const fetch = await config.get(`remote.${oldName}.fetch`)

    if (!url) {
      throw new Error(`Remote '${oldName}' not found`)
    }

    await config.set(`remote.${newName}.url`, url)
    if (fetch) {
      const newFetch = fetch.replace(new RegExp(oldName, 'g'), newName)
      await config.set(`remote.${newName}.fetch`, newFetch)
    }

    // Remove old remote config
    await config.deleteSection('remote', oldName)

    // Update branch tracking configs
    const branches = await config.getSubsections('branch')
    for (const branch of branches) {
      const branchRemote = await config.get(`branch.${branch}.remote`)
      if (branchRemote === oldName) {
        await config.set(`branch.${branch}.remote`, newName)
      }
    }

    await GitConfigManager.save({ fs, gitdir: updatedGitdir, config })

    // Rename remote tracking refs
    const refsDir = join(updatedGitdir, 'refs', 'remotes')
    const oldRefsDir = join(refsDir, oldName)
    const newRefsDir = join(refsDir, newName)

    try {
      const entries = await fs.readdir(oldRefsDir)
      if (entries && entries.length > 0) {
        await mkdirp(fs, newRefsDir)
        for (const entry of entries) {
          const content = await fs.read(join(oldRefsDir, entry), { encoding: 'utf8' })
          if (content) {
            await fs.write(join(newRefsDir, entry), content)
          }
          await fs.rm(join(oldRefsDir, entry))
        }
        await fs.rmdir(oldRefsDir)
      }
    } catch (e) {
      // refs dir might not exist yet
    }
  } catch (err) {
    err.caller = 'git.renameRemote'
    throw err
  }
}

/**
 * Set the URL for a remote.
 * Equivalent to libgit2's `git_remote_set_url`.
 *
 * @param {object} args
 * @param {FsClient} args.fs - a file system client
 * @param {string} [args.dir] - The working tree directory path
 * @param {string} [args.gitdir=join(dir, '.git')] - The git directory path
 * @param {string} args.remote - Remote name
 * @param {string} args.url - New URL
 * @returns {Promise<void>}
 */
export async function setRemoteUrl({
  fs: _fs,
  dir,
  gitdir = join(dir, '.git'),
  remote,
  url,
}) {
  try {
    assertParameter('fs', _fs)
    assertParameter('gitdir', gitdir)
    assertParameter('remote', remote)
    assertParameter('url', url)
    const fs = new FileSystem(_fs)
    const updatedGitdir = await discoverGitdir({ fsp: fs, dotgit: gitdir })

    const config = await GitConfigManager.get({ fs, gitdir: updatedGitdir })
    await config.set(`remote.${remote}.url`, url)
    await GitConfigManager.save({ fs, gitdir: updatedGitdir, config })
  } catch (err) {
    err.caller = 'git.setRemoteUrl'
    throw err
  }
}

/**
 * Set the push URL for a remote.
 * Equivalent to libgit2's `git_remote_set_pushurl`.
 *
 * @param {object} args
 * @param {FsClient} args.fs - a file system client
 * @param {string} [args.dir] - The working tree directory path
 * @param {string} [args.gitdir=join(dir, '.git')] - The git directory path
 * @param {string} args.remote - Remote name
 * @param {string} args.url - Push URL
 * @returns {Promise<void>}
 */
export async function setRemotePushUrl({
  fs: _fs,
  dir,
  gitdir = join(dir, '.git'),
  remote,
  url,
}) {
  try {
    assertParameter('fs', _fs)
    assertParameter('gitdir', gitdir)
    assertParameter('remote', remote)
    assertParameter('url', url)
    const fs = new FileSystem(_fs)
    const updatedGitdir = await discoverGitdir({ fsp: fs, dotgit: gitdir })

    const config = await GitConfigManager.get({ fs, gitdir: updatedGitdir })
    await config.set(`remote.${remote}.pushurl`, url)
    await GitConfigManager.save({ fs, gitdir: updatedGitdir, config })
  } catch (err) {
    err.caller = 'git.setRemotePushUrl'
    throw err
  }
}

/**
 * Get the default branch for a remote (from remote HEAD).
 * Equivalent to libgit2's `git_remote_default_branch`.
 *
 * @param {object} args
 * @param {FsClient} args.fs - a file system client
 * @param {string} [args.dir] - The working tree directory path
 * @param {string} [args.gitdir=join(dir, '.git')] - The git directory path
 * @param {string} args.remote - Remote name
 * @returns {Promise<string|null>} The default branch name, or null
 */
export async function remoteDefaultBranch({
  fs: _fs,
  dir,
  gitdir = join(dir, '.git'),
  remote,
}) {
  try {
    assertParameter('fs', _fs)
    assertParameter('gitdir', gitdir)
    assertParameter('remote', remote)
    const fs = new FileSystem(_fs)
    const updatedGitdir = await discoverGitdir({ fsp: fs, dotgit: gitdir })

    // Check refs/remotes/<remote>/HEAD
    const headRef = join(updatedGitdir, 'refs', 'remotes', remote, 'HEAD')
    const content = await fs.read(headRef, { encoding: 'utf8' })
    if (content) {
      const trimmed = content.trim()
      if (trimmed.startsWith('ref:')) {
        return trimmed.slice(4).trim()
      }
    }

    return null
  } catch (err) {
    err.caller = 'git.remoteDefaultBranch'
    throw err
  }
}

// ---- helpers ----

async function mkdirp(fs, dirpath) {
  try {
    await fs._stat(dirpath)
    return
  } catch (e) {
    // doesn't exist
  }
  const parent = dirpath.slice(0, dirpath.lastIndexOf('/'))
  if (parent && parent !== dirpath) {
    await mkdirp(fs, parent)
  }
  try {
    await fs.mkdir(dirpath)
  } catch (e) {
    // ignore EEXIST
  }
}
