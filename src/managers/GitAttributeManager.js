import '../typedefs.js'

import { join } from '../utils/join.js'

/**
 * Attribute value types matching libgit2's git_attr_value_t
 */
export const ATTR_VALUE = Object.freeze({
  UNSPECIFIED: 0,  // attribute not mentioned
  TRUE: 1,         // pattern: "attr" (set)
  FALSE: 2,        // pattern: "-attr" (unset)
  STRING: 3,       // pattern: "attr=value"
})

/**
 * Parse a single .gitattributes line into { pattern, attrs }.
 * Format: <pattern> <attr1> <attr2>=<value> -<attr3> !<attr4>
 */
function parseAttributeLine(line) {
  line = line.trim()
  if (!line || line.startsWith('#')) return null

  const parts = line.split(/\s+/)
  if (parts.length < 2) return null

  const pattern = parts[0]
  const attrs = {}

  for (let i = 1; i < parts.length; i++) {
    const token = parts[i]
    if (token.startsWith('-')) {
      // Unset: -attr
      attrs[token.slice(1)] = { type: ATTR_VALUE.FALSE, value: null }
    } else if (token.startsWith('!')) {
      // Unspecified (explicitly): !attr
      attrs[token.slice(1)] = { type: ATTR_VALUE.UNSPECIFIED, value: null }
    } else if (token.includes('=')) {
      // String value: attr=value
      const eqIdx = token.indexOf('=')
      const name = token.slice(0, eqIdx)
      const value = token.slice(eqIdx + 1)
      attrs[name] = { type: ATTR_VALUE.STRING, value }
    } else {
      // Set: attr
      attrs[token] = { type: ATTR_VALUE.TRUE, value: null }
    }
  }

  return { pattern, attrs }
}

/**
 * Parse a .gitattributes file content into an array of rules.
 */
function parseAttributeFile(content) {
  if (!content) return []
  const rules = []
  for (const line of content.split('\n')) {
    const parsed = parseAttributeLine(line)
    if (parsed) rules.push(parsed)
  }
  return rules
}

/**
 * Match a filepath against a gitattributes pattern.
 * Supports: *, ?, [chars], **, leading /
 */
function matchPattern(pattern, filepath) {
  // If pattern starts with '/', it only matches from root
  let anchored = false
  if (pattern.startsWith('/')) {
    anchored = true
    pattern = pattern.slice(1)
  } else if (pattern.includes('/') && !pattern.endsWith('/')) {
    // patterns with / (not trailing) are anchored
    anchored = true
  }

  // If pattern ends with '/', it matches directories only
  // For simplicity, we match both (we don't track dir vs file here)
  if (pattern.endsWith('/')) {
    pattern = pattern.slice(0, -1)
  }

  const filename = filepath.split('/').pop()

  // For unanchored patterns without path separators, match against filename only
  if (!anchored && !pattern.includes('/')) {
    return globMatch(pattern, filename)
  }

  // For anchored patterns, match against the full relative path
  return globMatch(pattern, filepath)
}

/**
 * Simple glob matcher supporting *, ?, **, [chars]
 */
function globMatch(pattern, str) {
  let re = ''
  let i = 0
  while (i < pattern.length) {
    const c = pattern[i]
    if (c === '*') {
      if (pattern[i + 1] === '*') {
        // ** matches everything including /
        if (pattern[i + 2] === '/') {
          re += '(?:.*/)?'
          i += 3
        } else {
          re += '.*'
          i += 2
        }
      } else {
        // * matches everything except /
        re += '[^/]*'
        i++
      }
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
  return new RegExp('^' + re + '$').test(str)
}

/**
 * Manager for reading and matching .gitattributes rules.
 */
export class GitAttributeManager {
  /**
   * Get the value of a single attribute for a given filepath.
   *
   * @param {Object} args
   * @param {FSClient} args.fs - A file system implementation
   * @param {string} args.dir - The working directory
   * @param {string} [args.gitdir=join(dir, '.git')] - The git directory path
   * @param {string} args.filepath - The path to query (relative to dir)
   * @param {string} args.attr - The attribute name to look up
   * @returns {Promise<{type: number, value: string|null}>} The attribute value
   */
  static async getAttribute({ fs, dir, gitdir = join(dir, '.git'), filepath, attr }) {
    const rules = await GitAttributeManager._loadRules({ fs, dir, gitdir, filepath })
    return GitAttributeManager._resolveAttribute(rules, filepath, attr)
  }

  /**
   * Get multiple attributes for a given filepath.
   *
   * @param {Object} args
   * @param {FSClient} args.fs - A file system implementation
   * @param {string} args.dir - The working directory
   * @param {string} [args.gitdir=join(dir, '.git')] - The git directory path
   * @param {string} args.filepath - The path to query
   * @param {string[]} args.attrs - Array of attribute names
   * @returns {Promise<Object<string, {type: number, value: string|null}>>} Map of attr → value
   */
  static async getAttributes({ fs, dir, gitdir = join(dir, '.git'), filepath, attrs }) {
    const rules = await GitAttributeManager._loadRules({ fs, dir, gitdir, filepath })
    const result = {}
    for (const attr of attrs) {
      result[attr] = GitAttributeManager._resolveAttribute(rules, filepath, attr)
    }
    return result
  }

  /**
   * Iterate all attributes that apply to a given filepath.
   *
   * @param {Object} args
   * @param {FSClient} args.fs - A file system implementation
   * @param {string} args.dir - The working directory
   * @param {string} [args.gitdir=join(dir, '.git')] - The git directory path
   * @param {string} args.filepath - The path to query
   * @returns {Promise<Object<string, {type: number, value: string|null}>>} All matching attributes
   */
  static async getAllAttributes({ fs, dir, gitdir = join(dir, '.git'), filepath }) {
    const rules = await GitAttributeManager._loadRules({ fs, dir, gitdir, filepath })
    const result = {}

    // Apply rules in order — later rules override earlier ones
    for (const ruleSet of rules) {
      for (const rule of ruleSet) {
        if (matchPattern(rule.pattern, filepath)) {
          for (const [name, value] of Object.entries(rule.attrs)) {
            result[name] = value
          }
        }
      }
    }

    return result
  }

  /**
   * Load all attribute rule sets that could affect a filepath.
   * Order (lowest to highest priority):
   * 1. .git/info/attributes
   * 2. .gitattributes in repo root
   * 3. .gitattributes in parent directories (closer = higher priority)
   *
   * @private
   */
  static async _loadRules({ fs, dir, gitdir, filepath }) {
    const ruleSets = []

    // 1. Built-in / .git/info/attributes (lowest priority)
    const infoAttrsPath = join(gitdir, 'info', 'attributes')
    const infoContent = await safeRead(fs, infoAttrsPath)
    if (infoContent) {
      ruleSets.push(parseAttributeFile(infoContent))
    }

    // 2. .gitattributes from root
    const rootAttrs = await safeRead(fs, join(dir, '.gitattributes'))
    if (rootAttrs) {
      ruleSets.push(parseAttributeFile(rootAttrs))
    }

    // 3. .gitattributes in subdirectories closer to the file
    const parts = filepath.split('/').filter(Boolean)
    for (let i = 1; i < parts.length; i++) {
      const subdir = parts.slice(0, i).join('/')
      const content = await safeRead(fs, join(dir, subdir, '.gitattributes'))
      if (content) {
        // For subdirectory .gitattributes, patterns are relative to that directory
        const parsed = parseAttributeFile(content)
        // Adjust patterns to be relative to repo root
        for (const rule of parsed) {
          if (!rule.pattern.startsWith('/')) {
            // Keep as-is for non-anchored patterns (they match filename)
          } else {
            rule.pattern = '/' + subdir + rule.pattern
          }
        }
        ruleSets.push(parsed)
      }
    }

    return ruleSets
  }

  /**
   * Resolve a single attribute from loaded rule sets.
   * Last matching rule wins (later rule sets have higher priority).
   *
   * @private
   */
  static _resolveAttribute(ruleSets, filepath, attr) {
    let result = { type: ATTR_VALUE.UNSPECIFIED, value: null }

    for (const ruleSet of ruleSets) {
      for (const rule of ruleSet) {
        if (matchPattern(rule.pattern, filepath) && attr in rule.attrs) {
          result = rule.attrs[attr]
        }
      }
    }

    return result
  }
}

async function safeRead(fs, filepath) {
  try {
    return await fs.read(filepath, { encoding: 'utf8' })
  } catch (e) {
    return null
  }
}
