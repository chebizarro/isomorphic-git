// @ts-check
import '../typedefs.js'

import { GitAttributeManager, ATTR_VALUE } from '../managers/GitAttributeManager.js'
import { FileSystem } from '../models/FileSystem.js'
import { assertParameter } from '../utils/assertParameter.js'
import { discoverGitdir } from '../utils/discoverGitdir.js'
import { join } from '../utils/join.js'

/**
 * Get the value of a git attribute for a file.
 * Equivalent to libgit2's `git_attr_get`.
 *
 * Reads .gitattributes from the repo root, subdirectories, and
 * .git/info/attributes to determine the attribute value.
 *
 * @param {object} args
 * @param {FsClient} args.fs - a file system client
 * @param {string} [args.dir] - The working tree directory path
 * @param {string} [args.gitdir=join(dir, '.git')] - The git directory path
 * @param {string} args.filepath - File path to check (relative to dir)
 * @param {string} args.attr - Attribute name to look up
 * @returns {Promise<{type: number, value: string|null}>} The attribute value.
 *   type is one of ATTR_VALUE.UNSPECIFIED (0), TRUE (1), FALSE (2), STRING (3).
 */
export async function getAttr({
  fs: _fs,
  dir,
  gitdir = join(dir, '.git'),
  filepath,
  attr,
}) {
  try {
    assertParameter('fs', _fs)
    assertParameter('gitdir', gitdir)
    assertParameter('filepath', filepath)
    assertParameter('attr', attr)
    const fs = new FileSystem(_fs)
    const updatedGitdir = await discoverGitdir({ fsp: fs, dotgit: gitdir })

    return GitAttributeManager.getAttribute({
      fs,
      dir,
      gitdir: updatedGitdir,
      filepath,
      attr,
    })
  } catch (err) {
    err.caller = 'git.getAttr'
    throw err
  }
}

/**
 * Get multiple git attributes for a file at once.
 * Equivalent to libgit2's `git_attr_get_many`.
 *
 * @param {object} args
 * @param {FsClient} args.fs - a file system client
 * @param {string} [args.dir] - The working tree directory path
 * @param {string} [args.gitdir=join(dir, '.git')] - The git directory path
 * @param {string} args.filepath - File path to check (relative to dir)
 * @param {string[]} args.attrs - Array of attribute names to look up
 * @returns {Promise<Object<string, {type: number, value: string|null}>>} Map of attribute → value
 */
export async function getAttrMany({
  fs: _fs,
  dir,
  gitdir = join(dir, '.git'),
  filepath,
  attrs,
}) {
  try {
    assertParameter('fs', _fs)
    assertParameter('gitdir', gitdir)
    assertParameter('filepath', filepath)
    assertParameter('attrs', attrs)
    const fs = new FileSystem(_fs)
    const updatedGitdir = await discoverGitdir({ fsp: fs, dotgit: gitdir })

    return GitAttributeManager.getAttributes({
      fs,
      dir,
      gitdir: updatedGitdir,
      filepath,
      attrs,
    })
  } catch (err) {
    err.caller = 'git.getAttrMany'
    throw err
  }
}

/**
 * Get all matching git attributes for a file.
 * Equivalent to libgit2's `git_attr_foreach`.
 *
 * @param {object} args
 * @param {FsClient} args.fs - a file system client
 * @param {string} [args.dir] - The working tree directory path
 * @param {string} [args.gitdir=join(dir, '.git')] - The git directory path
 * @param {string} args.filepath - File path to check (relative to dir)
 * @returns {Promise<Object<string, {type: number, value: string|null}>>} All matching attributes
 */
export async function getAttrAll({
  fs: _fs,
  dir,
  gitdir = join(dir, '.git'),
  filepath,
}) {
  try {
    assertParameter('fs', _fs)
    assertParameter('gitdir', gitdir)
    assertParameter('filepath', filepath)
    const fs = new FileSystem(_fs)
    const updatedGitdir = await discoverGitdir({ fsp: fs, dotgit: gitdir })

    return GitAttributeManager.getAllAttributes({
      fs,
      dir,
      gitdir: updatedGitdir,
      filepath,
    })
  } catch (err) {
    err.caller = 'git.getAttrAll'
    throw err
  }
}

export { ATTR_VALUE }
