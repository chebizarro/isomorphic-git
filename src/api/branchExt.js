// @ts-check
import '../typedefs.js'

import { GitConfigManager } from '../managers/GitConfigManager.js'
import { GitRefManager } from '../managers/GitRefManager.js'
import { FileSystem } from '../models/FileSystem.js'
import { assertParameter } from '../utils/assertParameter.js'
import { discoverGitdir } from '../utils/discoverGitdir.js'
import { join } from '../utils/join.js'

/**
 * Get the upstream (tracking) branch info for a local branch.
 * Equivalent to libgit2's `git_branch_upstream` and `git_branch_upstream_name`.
 *
 * @param {object} args
 * @param {FsClient} args.fs - a file system client
 * @param {string} [args.dir] - The working tree directory path
 * @param {string} [args.gitdir=join(dir, '.git')] - The git directory path
 * @param {string} args.ref - The local branch name (e.g., 'main')
 * @returns {Promise<{remote: string, merge: string, ref: string}|null>}
 *   The upstream info, or null if no upstream is configured.
 */
export async function branchUpstream({
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

    const config = await GitConfigManager.get({ fs, gitdir: updatedGitdir })
    const remote = await config.get(`branch.${ref}.remote`)
    const merge = await config.get(`branch.${ref}.merge`)

    if (!remote || !merge) return null

    // Compute the full remote tracking ref
    // merge is typically refs/heads/main, and the tracking ref is refs/remotes/origin/main
    let trackingRef = merge
    if (merge.startsWith('refs/heads/')) {
      trackingRef = `refs/remotes/${remote}/${merge.slice('refs/heads/'.length)}`
    }

    return { remote, merge, ref: trackingRef }
  } catch (err) {
    err.caller = 'git.branchUpstream'
    throw err
  }
}

/**
 * Set the upstream (tracking) branch for a local branch.
 * Equivalent to libgit2's `git_branch_set_upstream`.
 *
 * @param {object} args
 * @param {FsClient} args.fs - a file system client
 * @param {string} [args.dir] - The working tree directory path
 * @param {string} [args.gitdir=join(dir, '.git')] - The git directory path
 * @param {string} args.ref - The local branch name
 * @param {string} args.remote - The remote name (e.g., 'origin')
 * @param {string} args.merge - The remote branch (e.g., 'refs/heads/main')
 * @returns {Promise<void>}
 */
export async function setBranchUpstream({
  fs: _fs,
  dir,
  gitdir = join(dir, '.git'),
  ref,
  remote,
  merge,
}) {
  try {
    assertParameter('fs', _fs)
    assertParameter('gitdir', gitdir)
    assertParameter('ref', ref)
    assertParameter('remote', remote)
    assertParameter('merge', merge)
    const fs = new FileSystem(_fs)
    const updatedGitdir = await discoverGitdir({ fsp: fs, dotgit: gitdir })

    const config = await GitConfigManager.get({ fs, gitdir: updatedGitdir })
    await config.set(`branch.${ref}.remote`, remote)
    await config.set(`branch.${ref}.merge`, merge)
    await GitConfigManager.save({ fs, gitdir: updatedGitdir, config })
  } catch (err) {
    err.caller = 'git.setBranchUpstream'
    throw err
  }
}

/**
 * Unset the upstream for a local branch.
 * Equivalent to libgit2's `git_branch_set_upstream(branch, NULL)`.
 *
 * @param {object} args
 * @param {FsClient} args.fs - a file system client
 * @param {string} [args.dir] - The working tree directory path
 * @param {string} [args.gitdir=join(dir, '.git')] - The git directory path
 * @param {string} args.ref - The local branch name
 * @returns {Promise<void>}
 */
export async function unsetBranchUpstream({
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

    const config = await GitConfigManager.get({ fs, gitdir: updatedGitdir })
    await config.set(`branch.${ref}.remote`, undefined)
    await config.set(`branch.${ref}.merge`, undefined)
    await GitConfigManager.save({ fs, gitdir: updatedGitdir, config })
  } catch (err) {
    err.caller = 'git.unsetBranchUpstream'
    throw err
  }
}

/**
 * Check if a local branch name is valid.
 * Equivalent to libgit2's `git_branch_name_is_valid`.
 *
 * @param {string} name - The branch name to validate
 * @returns {boolean}
 */
export function branchNameIsValid(name) {
  if (!name || name.length === 0) return false
  // Git branch name rules
  if (name.startsWith('.')) return false
  if (name.endsWith('.')) return false
  if (name.endsWith('.lock')) return false
  if (name.includes('..')) return false
  if (name.includes('//')) return false
  if (name.includes('@{')) return false
  if (name.includes('\\')) return false
  if (name.includes(' ')) return false
  if (name.includes('~')) return false
  if (name.includes('^')) return false
  if (name.includes(':')) return false
  if (name.includes('?')) return false
  if (name.includes('*')) return false
  if (name.includes('[')) return false
  // Control chars
  for (let i = 0; i < name.length; i++) {
    const c = name.charCodeAt(i)
    if (c < 0x20 || c === 0x7f) return false
  }
  return true
}

/**
 * Check if a ref is a local branch.
 * Equivalent to libgit2's `git_branch_is_head`.
 *
 * @param {object} args
 * @param {FsClient} args.fs - a file system client
 * @param {string} [args.dir] - The working tree directory path
 * @param {string} [args.gitdir=join(dir, '.git')] - The git directory path
 * @param {string} args.ref - The branch name to check
 * @returns {Promise<boolean>} True if this branch is the current HEAD
 */
export async function branchIsHead({
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

    const head = await fs.read(join(updatedGitdir, 'HEAD'), { encoding: 'utf8' })
    if (!head) return false
    const trimmed = head.trim()
    if (!trimmed.startsWith('ref:')) return false

    const headRef = trimmed.slice(4).trim()
    return headRef === `refs/heads/${ref}` || headRef === ref
  } catch (err) {
    err.caller = 'git.branchIsHead'
    throw err
  }
}
