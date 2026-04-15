// @ts-check
import '../typedefs.js'

import { GitConfigManager } from '../managers/GitConfigManager.js'
import { FileSystem } from '../models/FileSystem.js'
import { assertParameter } from '../utils/assertParameter.js'
import { discoverGitdir } from '../utils/discoverGitdir.js'
import { join } from '../utils/join.js'

/**
 * Delete a config section and all its variables.
 * Equivalent to libgit2's `git_config_delete_section`.
 *
 * @param {object} args
 * @param {FsClient} args.fs - a file system client
 * @param {string} [args.dir] - The working tree directory path
 * @param {string} [args.gitdir=join(dir, '.git')] - The git directory path
 * @param {string} args.section - The section name (e.g., 'remote')
 * @param {string} [args.subsection] - The subsection name (e.g., 'origin')
 * @returns {Promise<void>}
 */
export async function deleteConfigSection({
  fs: _fs,
  dir,
  gitdir = join(dir, '.git'),
  section,
  subsection,
}) {
  try {
    assertParameter('fs', _fs)
    assertParameter('gitdir', gitdir)
    assertParameter('section', section)
    const fs = new FileSystem(_fs)
    const updatedGitdir = await discoverGitdir({ fsp: fs, dotgit: gitdir })

    const config = await GitConfigManager.get({ fs, gitdir: updatedGitdir })
    await config.deleteSection(section, subsection)
    await GitConfigManager.save({ fs, gitdir: updatedGitdir, config })
  } catch (err) {
    err.caller = 'git.deleteConfigSection'
    throw err
  }
}

/**
 * List all subsections within a config section.
 * Equivalent to libgit2's config iterator with section prefix.
 *
 * For example, `listConfigSubsections({ section: 'remote' })` returns
 * `['origin', 'upstream']` if those remotes are configured.
 *
 * @param {object} args
 * @param {FsClient} args.fs - a file system client
 * @param {string} [args.dir] - The working tree directory path
 * @param {string} [args.gitdir=join(dir, '.git')] - The git directory path
 * @param {string} args.section - The section name
 * @returns {Promise<string[]>} Array of subsection names
 */
export async function listConfigSubsections({
  fs: _fs,
  dir,
  gitdir = join(dir, '.git'),
  section,
}) {
  try {
    assertParameter('fs', _fs)
    assertParameter('gitdir', gitdir)
    assertParameter('section', section)
    const fs = new FileSystem(_fs)
    const updatedGitdir = await discoverGitdir({ fsp: fs, dotgit: gitdir })

    const config = await GitConfigManager.get({ fs, gitdir: updatedGitdir })
    return config.getSubsections(section)
  } catch (err) {
    err.caller = 'git.listConfigSubsections'
    throw err
  }
}

/**
 * Delete a single config entry.
 * Equivalent to libgit2's `git_config_delete_entry`.
 *
 * @param {object} args
 * @param {FsClient} args.fs - a file system client
 * @param {string} [args.dir] - The working tree directory path
 * @param {string} [args.gitdir=join(dir, '.git')] - The git directory path
 * @param {string} args.path - The config path (e.g., 'user.name')
 * @returns {Promise<void>}
 */
export async function deleteConfig({
  fs: _fs,
  dir,
  gitdir = join(dir, '.git'),
  path,
}) {
  try {
    assertParameter('fs', _fs)
    assertParameter('gitdir', gitdir)
    assertParameter('path', path)
    const fs = new FileSystem(_fs)
    const updatedGitdir = await discoverGitdir({ fsp: fs, dotgit: gitdir })

    const config = await GitConfigManager.get({ fs, gitdir: updatedGitdir })
    await config.set(path, undefined)
    await GitConfigManager.save({ fs, gitdir: updatedGitdir, config })
  } catch (err) {
    err.caller = 'git.deleteConfig'
    throw err
  }
}

/**
 * Append a value to a multi-valued config entry.
 * Equivalent to libgit2's `git_config_set_multivar`.
 *
 * @param {object} args
 * @param {FsClient} args.fs - a file system client
 * @param {string} [args.dir] - The working tree directory path
 * @param {string} [args.gitdir=join(dir, '.git')] - The git directory path
 * @param {string} args.path - The config path
 * @param {string} args.value - The value to append
 * @returns {Promise<void>}
 */
export async function appendConfig({
  fs: _fs,
  dir,
  gitdir = join(dir, '.git'),
  path,
  value,
}) {
  try {
    assertParameter('fs', _fs)
    assertParameter('gitdir', gitdir)
    assertParameter('path', path)
    const fs = new FileSystem(_fs)
    const updatedGitdir = await discoverGitdir({ fsp: fs, dotgit: gitdir })

    const config = await GitConfigManager.get({ fs, gitdir: updatedGitdir })
    await config.append(path, value)
    await GitConfigManager.save({ fs, gitdir: updatedGitdir, config })
  } catch (err) {
    err.caller = 'git.appendConfig'
    throw err
  }
}
