// @ts-check
import '../typedefs.js'

import ignore from 'ignore'

import { FileSystem } from '../models/FileSystem.js'
import { assertParameter } from '../utils/assertParameter.js'
import { discoverGitdir } from '../utils/discoverGitdir.js'
import { join } from '../utils/join.js'

/**
 * Runtime ignore rules that can be added programmatically.
 * These are per-session and don't persist to .gitignore files.
 * @private
 */
const runtimeRules = new Map() // gitdir -> string[]

/**
 * Add runtime ignore rules (not persisted to .gitignore).
 * Equivalent to libgit2's `git_ignore_add_rule`.
 *
 * @param {object} args
 * @param {FsClient} args.fs - a file system client
 * @param {string} [args.dir] - The working tree directory path
 * @param {string} [args.gitdir=join(dir, '.git')] - The git directory path
 * @param {string[]} args.rules - Ignore patterns to add
 * @returns {Promise<void>}
 */
export async function ignoreAddRule({
  fs: _fs,
  dir,
  gitdir = join(dir, '.git'),
  rules,
}) {
  try {
    assertParameter('fs', _fs)
    assertParameter('gitdir', gitdir)
    assertParameter('rules', rules)
    const fs = new FileSystem(_fs)
    const updatedGitdir = await discoverGitdir({ fsp: fs, dotgit: gitdir })

    if (!runtimeRules.has(updatedGitdir)) {
      runtimeRules.set(updatedGitdir, [])
    }
    runtimeRules.get(updatedGitdir).push(...rules)
  } catch (err) {
    err.caller = 'git.ignoreAddRule'
    throw err
  }
}

/**
 * Clear all runtime ignore rules.
 * Equivalent to libgit2's `git_ignore_clear_internal_rules`.
 *
 * @param {object} args
 * @param {FsClient} args.fs - a file system client
 * @param {string} [args.dir] - The working tree directory path
 * @param {string} [args.gitdir=join(dir, '.git')] - The git directory path
 * @returns {Promise<void>}
 */
export async function ignoreClearRules({
  fs: _fs,
  dir,
  gitdir = join(dir, '.git'),
}) {
  try {
    assertParameter('fs', _fs)
    assertParameter('gitdir', gitdir)
    const fs = new FileSystem(_fs)
    const updatedGitdir = await discoverGitdir({ fsp: fs, dotgit: gitdir })
    runtimeRules.delete(updatedGitdir)
  } catch (err) {
    err.caller = 'git.ignoreClearRules'
    throw err
  }
}

/**
 * Check if a path is ignored by gitignore rules (including runtime rules).
 * Equivalent to libgit2's `git_ignore_path_is_ignored`.
 *
 * This extends the existing isIgnored with support for runtime rules.
 *
 * @param {object} args
 * @param {FsClient} args.fs - a file system client
 * @param {string} [args.dir] - The working tree directory path
 * @param {string} [args.gitdir=join(dir, '.git')] - The git directory path
 * @param {string} args.filepath - Path to check
 * @returns {Promise<boolean>}
 */
export async function ignorePathIsIgnored({
  fs: _fs,
  dir,
  gitdir = join(dir, '.git'),
  filepath,
}) {
  try {
    assertParameter('fs', _fs)
    assertParameter('dir', dir)
    assertParameter('gitdir', gitdir)
    assertParameter('filepath', filepath)
    const fs = new FileSystem(_fs)
    const updatedGitdir = await discoverGitdir({ fsp: fs, dotgit: gitdir })

    const ign = ignore()

    // Load .git/info/exclude
    const excludesFile = join(updatedGitdir, 'info', 'exclude')
    const excludes = await fs.read(excludesFile, { encoding: 'utf8' })
    if (excludes) ign.add(excludes)

    // Load .gitignore files
    const parts = filepath.split('/').filter(Boolean)
    const gitignoreFiles = [join(dir, '.gitignore')]
    for (let i = 1; i < parts.length; i++) {
      gitignoreFiles.push(join(dir, parts.slice(0, i).join('/'), '.gitignore'))
    }

    for (const gf of gitignoreFiles) {
      const content = await fs.read(gf, { encoding: 'utf8' })
      if (content) ign.add(content)
    }

    // Load runtime rules
    const rules = runtimeRules.get(updatedGitdir)
    if (rules) {
      ign.add(rules.join('\n'))
    }

    return ign.ignores(filepath)
  } catch (err) {
    err.caller = 'git.ignorePathIsIgnored'
    throw err
  }
}
