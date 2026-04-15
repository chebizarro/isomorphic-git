// @ts-check
import '../typedefs.js'

import { FileSystem } from '../models/FileSystem.js'
import { assertParameter } from '../utils/assertParameter.js'
import { discoverGitdir } from '../utils/discoverGitdir.js'
import { join } from '../utils/join.js'

/**
 * Initialize sparse-checkout for the repository.
 * Creates the .git/info/sparse-checkout file and sets core.sparseCheckout=true.
 *
 * @param {object} args
 * @param {FsClient} args.fs - a file system client
 * @param {string} [args.dir] - The working tree directory path
 * @param {string} [args.gitdir=join(dir, '.git')] - The git directory path
 * @param {string[]} [args.patterns=['/*']] - Initial sparse-checkout patterns
 * @param {boolean} [args.cone=false] - Use cone mode (directory-based matching)
 * @returns {Promise<void>}
 */
export async function sparseCheckoutInit({
  fs: _fs,
  dir,
  gitdir = join(dir, '.git'),
  patterns = ['/*'],
  cone = false,
}) {
  try {
    assertParameter('fs', _fs)
    assertParameter('gitdir', gitdir)
    const fs = new FileSystem(_fs)
    const updatedGitdir = await discoverGitdir({ fsp: fs, dotgit: gitdir })

    // Set config
    const { GitConfigManager } = await import('../managers/GitConfigManager.js')
    const config = await GitConfigManager.get({ fs, gitdir: updatedGitdir })
    await config.set('core.sparseCheckout', true)
    if (cone) {
      await config.set('core.sparseCheckoutCone', true)
    }
    await GitConfigManager.save({ fs, gitdir: updatedGitdir, config })

    // Create info directory
    const infoDir = join(updatedGitdir, 'info')
    try { await fs.mkdir(infoDir) } catch (e) { /* exists */ }

    // Write sparse-checkout file
    await fs.write(
      join(updatedGitdir, 'info', 'sparse-checkout'),
      patterns.join('\n') + '\n'
    )
  } catch (err) {
    err.caller = 'git.sparseCheckoutInit'
    throw err
  }
}

/**
 * Set the sparse-checkout patterns.
 *
 * @param {object} args
 * @param {FsClient} args.fs - a file system client
 * @param {string} [args.dir] - The working tree directory path
 * @param {string} [args.gitdir=join(dir, '.git')] - The git directory path
 * @param {string[]} args.patterns - The patterns to set
 * @returns {Promise<void>}
 */
export async function sparseCheckoutSet({
  fs: _fs,
  dir,
  gitdir = join(dir, '.git'),
  patterns,
}) {
  try {
    assertParameter('fs', _fs)
    assertParameter('gitdir', gitdir)
    assertParameter('patterns', patterns)
    const fs = new FileSystem(_fs)
    const updatedGitdir = await discoverGitdir({ fsp: fs, dotgit: gitdir })

    await fs.write(
      join(updatedGitdir, 'info', 'sparse-checkout'),
      patterns.join('\n') + '\n'
    )
  } catch (err) {
    err.caller = 'git.sparseCheckoutSet'
    throw err
  }
}

/**
 * Add patterns to the sparse-checkout file.
 *
 * @param {object} args
 * @param {FsClient} args.fs - a file system client
 * @param {string} [args.dir] - The working tree directory path
 * @param {string} [args.gitdir=join(dir, '.git')] - The git directory path
 * @param {string[]} args.patterns - The patterns to add
 * @returns {Promise<void>}
 */
export async function sparseCheckoutAdd({
  fs: _fs,
  dir,
  gitdir = join(dir, '.git'),
  patterns,
}) {
  try {
    assertParameter('fs', _fs)
    assertParameter('gitdir', gitdir)
    assertParameter('patterns', patterns)
    const fs = new FileSystem(_fs)
    const updatedGitdir = await discoverGitdir({ fsp: fs, dotgit: gitdir })

    const filepath = join(updatedGitdir, 'info', 'sparse-checkout')
    let existing = await fs.read(filepath, { encoding: 'utf8' }) || ''
    const existingSet = new Set(existing.trim().split('\n').filter(Boolean))

    for (const p of patterns) {
      if (!existingSet.has(p)) {
        existing += p + '\n'
      }
    }

    await fs.write(filepath, existing)
  } catch (err) {
    err.caller = 'git.sparseCheckoutAdd'
    throw err
  }
}

/**
 * List the current sparse-checkout patterns.
 *
 * @param {object} args
 * @param {FsClient} args.fs - a file system client
 * @param {string} [args.dir] - The working tree directory path
 * @param {string} [args.gitdir=join(dir, '.git')] - The git directory path
 * @returns {Promise<string[]>} Current patterns
 */
export async function sparseCheckoutList({
  fs: _fs,
  dir,
  gitdir = join(dir, '.git'),
}) {
  try {
    assertParameter('fs', _fs)
    assertParameter('gitdir', gitdir)
    const fs = new FileSystem(_fs)
    const updatedGitdir = await discoverGitdir({ fsp: fs, dotgit: gitdir })

    const content = await fs.read(
      join(updatedGitdir, 'info', 'sparse-checkout'),
      { encoding: 'utf8' }
    )
    if (!content) return []
    return content.trim().split('\n').filter(Boolean)
  } catch (err) {
    err.caller = 'git.sparseCheckoutList'
    throw err
  }
}
