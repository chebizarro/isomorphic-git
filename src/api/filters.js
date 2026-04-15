// @ts-check
import '../typedefs.js'

import { GitAttributeManager, ATTR_VALUE } from '../managers/GitAttributeManager.js'
import { GitConfigManager } from '../managers/GitConfigManager.js'
import { FileSystem } from '../models/FileSystem.js'
import { assertParameter } from '../utils/assertParameter.js'
import { discoverGitdir } from '../utils/discoverGitdir.js'
import { join } from '../utils/join.js'

/**
 * Filter modes matching libgit2's git_filter_mode_t
 */
export const FILTER_MODE = Object.freeze({
  TO_WORKTREE: 0,  // smudge (checkout)
  TO_ODB: 1,       // clean (add/commit)
})

/**
 * Apply content filters to a buffer based on .gitattributes and config.
 * Equivalent to libgit2's `git_filter_list_apply_to_blob` and
 * `git_filter_list_apply_to_data`.
 *
 * Handles:
 * - Line ending conversion (text, eol, autocrlf)
 * - Custom smudge/clean filters (via onFilter callback)
 *
 * @param {object} args
 * @param {FsClient} args.fs - a file system client
 * @param {string} [args.dir] - The working tree directory path
 * @param {string} [args.gitdir=join(dir, '.git')] - The git directory path
 * @param {string} args.filepath - The file path (for attribute matching)
 * @param {Buffer|Uint8Array|string} args.content - The content to filter
 * @param {number} [args.mode=FILTER_MODE.TO_WORKTREE] - Filter direction
 * @param {function} [args.onFilter] - Custom filter callback: (name, content, mode) => content
 * @returns {Promise<Buffer|Uint8Array|string>} The filtered content
 */
export async function applyFilter({
  fs: _fs,
  dir,
  gitdir = join(dir, '.git'),
  filepath,
  content,
  mode = FILTER_MODE.TO_WORKTREE,
  onFilter,
}) {
  try {
    assertParameter('fs', _fs)
    assertParameter('gitdir', gitdir)
    assertParameter('filepath', filepath)
    assertParameter('content', content)
    const fs = new FileSystem(_fs)
    const updatedGitdir = await discoverGitdir({ fsp: fs, dotgit: gitdir })

    // Get relevant attributes for this file
    const attrs = await GitAttributeManager.getAttributes({
      fs,
      dir,
      gitdir: updatedGitdir,
      filepath,
      attrs: ['text', 'eol', 'filter', 'binary'],
    })

    // Get config values
    const config = await GitConfigManager.get({ fs, gitdir: updatedGitdir })
    const autocrlf = await config.get('core.autocrlf')
    const eolConfig = await config.get('core.eol')

    let result = typeof content === 'string'
      ? content
      : Buffer.isBuffer(content)
        ? content.toString('utf8')
        : new TextDecoder().decode(content)

    // Skip binary files
    if (attrs.binary && attrs.binary.type === ATTR_VALUE.TRUE) {
      return content
    }

    // Check if text processing applies
    let isText = false
    if (attrs.text) {
      if (attrs.text.type === ATTR_VALUE.TRUE) {
        isText = true
      } else if (attrs.text.type === ATTR_VALUE.FALSE) {
        isText = false
      } else if (attrs.text.type === ATTR_VALUE.STRING && attrs.text.value === 'auto') {
        // Auto-detect: check if content looks like text
        isText = !isBinaryContent(result)
      } else if (attrs.text.type === ATTR_VALUE.UNSPECIFIED) {
        // Use autocrlf setting
        isText = autocrlf === 'true' || autocrlf === 'input'
      }
    } else {
      isText = autocrlf === 'true' || autocrlf === 'input'
    }

    // Apply line ending conversion
    if (isText) {
      // Determine target line ending
      let targetEol = 'lf'

      if (attrs.eol && attrs.eol.type === ATTR_VALUE.STRING) {
        targetEol = attrs.eol.value // 'lf' or 'crlf'
      } else if (mode === FILTER_MODE.TO_WORKTREE) {
        if (autocrlf === 'true') {
          targetEol = 'crlf'
        } else if (eolConfig === 'crlf') {
          targetEol = 'crlf'
        }
      }

      if (mode === FILTER_MODE.TO_ODB) {
        // Clean: always normalize to LF for the ODB
        result = result.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
      } else if (mode === FILTER_MODE.TO_WORKTREE) {
        // Smudge: convert to target line endings
        // First normalize to LF
        result = result.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
        if (targetEol === 'crlf') {
          result = result.replace(/\n/g, '\r\n')
        }
      }
    }

    // Apply custom filter if specified
    if (attrs.filter && attrs.filter.type === ATTR_VALUE.STRING && onFilter) {
      const filterName = attrs.filter.value
      result = await onFilter(filterName, result, mode)
    }

    return result
  } catch (err) {
    err.caller = 'git.applyFilter'
    throw err
  }
}

/**
 * Get the list of filters that would be applied to a file.
 * Equivalent to libgit2's `git_filter_list_load`.
 *
 * @param {object} args
 * @param {FsClient} args.fs - a file system client
 * @param {string} [args.dir] - The working tree directory path
 * @param {string} [args.gitdir=join(dir, '.git')] - The git directory path
 * @param {string} args.filepath - The file path
 * @param {number} [args.mode=FILTER_MODE.TO_WORKTREE] - Filter direction
 * @returns {Promise<Array<{name: string, type: string}>>} List of filters
 */
export async function filterList({
  fs: _fs,
  dir,
  gitdir = join(dir, '.git'),
  filepath,
  mode = FILTER_MODE.TO_WORKTREE,
}) {
  try {
    assertParameter('fs', _fs)
    assertParameter('gitdir', gitdir)
    assertParameter('filepath', filepath)
    const fs = new FileSystem(_fs)
    const updatedGitdir = await discoverGitdir({ fsp: fs, dotgit: gitdir })

    const attrs = await GitAttributeManager.getAttributes({
      fs,
      dir,
      gitdir: updatedGitdir,
      filepath,
      attrs: ['text', 'eol', 'filter', 'binary'],
    })

    const filters = []

    // Binary check
    if (attrs.binary && attrs.binary.type === ATTR_VALUE.TRUE) {
      return filters
    }

    // Line ending filter
    const config = await GitConfigManager.get({ fs, gitdir: updatedGitdir })
    const autocrlf = await config.get('core.autocrlf')
    let isText = false
    if (attrs.text && attrs.text.type === ATTR_VALUE.TRUE) {
      isText = true
    } else if (attrs.text && attrs.text.type === ATTR_VALUE.STRING && attrs.text.value === 'auto') {
      isText = true // auto = text unless binary detected
    } else if (!attrs.text || attrs.text.type === ATTR_VALUE.UNSPECIFIED) {
      isText = autocrlf === 'true' || autocrlf === 'input'
    }

    if (isText) {
      filters.push({ name: 'crlf', type: 'builtin' })
    }

    // Custom filter
    if (attrs.filter && attrs.filter.type === ATTR_VALUE.STRING) {
      filters.push({ name: attrs.filter.value, type: 'custom' })
    }

    return filters
  } catch (err) {
    err.caller = 'git.filterList'
    throw err
  }
}

/**
 * Check if content appears to be binary (contains null bytes).
 * @private
 */
function isBinaryContent(content) {
  const checkLen = Math.min(content.length, 8000)
  for (let i = 0; i < checkLen; i++) {
    if (content.charCodeAt(i) === 0) return true
  }
  return false
}
