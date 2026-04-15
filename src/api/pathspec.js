// @ts-check
import '../typedefs.js'

/**
 * A pathspec matcher for git operations.
 * Equivalent to libgit2's git_pathspec API.
 */
export class Pathspec {
  /**
   * Create a new pathspec from patterns.
   * @param {string[]} patterns - Glob patterns to match
   */
  constructor(patterns) {
    this._patterns = patterns.map(p => ({
      original: p,
      negated: p.startsWith('!'),
      pattern: p.startsWith('!') ? p.slice(1) : p,
    }))
  }

  /**
   * Check if a single path matches this pathspec.
   * Equivalent to libgit2's `git_pathspec_matches_path`.
   *
   * @param {string} filepath - Path to test
   * @returns {boolean}
   */
  matches(filepath) {
    let matched = false
    for (const spec of this._patterns) {
      if (pathspecGlob(spec.pattern, filepath)) {
        matched = !spec.negated
      }
    }
    return matched
  }

  /**
   * Filter an array of paths through this pathspec.
   *
   * @param {string[]} paths - Paths to filter
   * @returns {string[]} Matching paths
   */
  filter(paths) {
    return paths.filter(p => this.matches(p))
  }

  /**
   * Get the original patterns.
   * @returns {string[]}
   */
  get patterns() {
    return this._patterns.map(p => p.original)
  }
}

/**
 * Create a new pathspec from an array of patterns.
 * Equivalent to libgit2's `git_pathspec_new`.
 *
 * @param {string[]} patterns - Glob patterns
 * @returns {Pathspec}
 */
export function pathspecNew(patterns) {
  return new Pathspec(patterns)
}

/**
 * Check if a path matches a pathspec pattern list.
 * Convenience function that creates a temporary Pathspec.
 *
 * @param {string[]} patterns - Glob patterns
 * @param {string} filepath - Path to test
 * @returns {boolean}
 */
export function pathspecMatchesPath(patterns, filepath) {
  return new Pathspec(patterns).matches(filepath)
}

/**
 * Glob matcher for pathspec patterns.
 * Supports: *, ?, [chars], ** for directory matching,
 * and prefix matching (pattern without wildcards matches prefix).
 * @private
 */
function pathspecGlob(pattern, filepath) {
  // Simple prefix match (no wildcards)
  if (!/[*?\[]/.test(pattern)) {
    if (filepath === pattern) return true
    if (filepath.startsWith(pattern + '/')) return true
    return false
  }

  // Convert glob to regex
  let re = ''
  let i = 0
  while (i < pattern.length) {
    const c = pattern[i]
    if (c === '*') {
      if (pattern[i + 1] === '*') {
        if (pattern[i + 2] === '/') {
          re += '(?:.*/)?'
          i += 3
          continue
        }
        re += '.*'
        i += 2
        continue
      }
      re += '[^/]*'
      i++
    } else if (c === '?') {
      re += '[^/]'
      i++
    } else if (c === '[') {
      const close = pattern.indexOf(']', i + 1)
      if (close === -1) {
        re += '\\['
        i++
      } else {
        re += '[' + pattern.slice(i + 1, close) + ']'
        i = close + 1
      }
    } else {
      re += c.replace(/[.+^${}()|\\]/g, '\\$&')
      i++
    }
  }
  return new RegExp('^' + re + '$').test(filepath)
}
