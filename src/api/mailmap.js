// @ts-check
import '../typedefs.js'

import { FileSystem } from '../models/FileSystem.js'
import { assertParameter } from '../utils/assertParameter.js'
import { discoverGitdir } from '../utils/discoverGitdir.js'
import { join } from '../utils/join.js'

/**
 * A mailmap resolver for mapping author identities.
 * Equivalent to libgit2's `git_mailmap` API.
 *
 * Parses .mailmap files and resolves canonical names/emails.
 *
 * Format:
 *   Proper Name <proper@email.xx>
 *   <proper@email.xx> <commit@email.xx>
 *   Proper Name <proper@email.xx> <commit@email.xx>
 *   Proper Name <proper@email.xx> Commit Name <commit@email.xx>
 */
export class Mailmap {
  constructor() {
    this._entries = []
  }

  /**
   * Add a single mailmap entry.
   * @param {object} entry
   * @param {string} [entry.realName] - Canonical name
   * @param {string} [entry.realEmail] - Canonical email
   * @param {string} [entry.replaceName] - Name to replace (optional)
   * @param {string} entry.replaceEmail - Email to match/replace
   */
  addEntry({ realName, realEmail, replaceName, replaceEmail }) {
    this._entries.push({
      realName: realName || null,
      realEmail: realEmail || null,
      replaceName: replaceName || null,
      replaceEmail: replaceEmail.toLowerCase(),
    })
  }

  /**
   * Parse a mailmap string and add all entries.
   * @param {string} content - Mailmap file content
   */
  addBuffer(content) {
    const lines = content.split('\n')
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue

      const entry = parseMailmapLine(trimmed)
      if (entry) {
        this._entries.push(entry)
      }
    }
  }

  /**
   * Resolve a name/email pair through the mailmap.
   * Equivalent to libgit2's `git_mailmap_resolve`.
   *
   * @param {string} name - Commit name
   * @param {string} email - Commit email
   * @returns {{name: string, email: string}} Resolved name and email
   */
  resolve(name, email) {
    const lowerEmail = email.toLowerCase()
    let resolvedName = name
    let resolvedEmail = email

    // Last matching entry wins
    for (const entry of this._entries) {
      // Check if email matches
      if (entry.replaceEmail !== lowerEmail) continue

      // If replaceName is specified, both name and email must match
      if (entry.replaceName && entry.replaceName !== name) continue

      if (entry.realName) resolvedName = entry.realName
      if (entry.realEmail) resolvedEmail = entry.realEmail
    }

    return { name: resolvedName, email: resolvedEmail }
  }

  /**
   * Get all entries.
   * @returns {Array<{realName: string|null, realEmail: string|null, replaceName: string|null, replaceEmail: string}>}
   */
  get entries() {
    return [...this._entries]
  }
}

/**
 * Create a mailmap from the repository's .mailmap file.
 * Equivalent to libgit2's `git_mailmap_from_repository`.
 *
 * @param {object} args
 * @param {FsClient} args.fs - a file system client
 * @param {string} [args.dir] - The working tree directory path
 * @param {string} [args.gitdir=join(dir, '.git')] - The git directory path
 * @returns {Promise<Mailmap>}
 */
export async function mailmapFromRepository({
  fs: _fs,
  dir,
  gitdir = join(dir, '.git'),
}) {
  try {
    assertParameter('fs', _fs)
    assertParameter('dir', dir)
    const fs = new FileSystem(_fs)
    const mailmap = new Mailmap()

    // Try to read .mailmap from the working directory
    const content = await fs.read(join(dir, '.mailmap'), { encoding: 'utf8' })
    if (content) {
      mailmap.addBuffer(content)
    }

    return mailmap
  } catch (err) {
    err.caller = 'git.mailmapFromRepository'
    throw err
  }
}

/**
 * Resolve an author signature through a mailmap.
 * Convenience function.
 *
 * @param {object} args
 * @param {Mailmap} args.mailmap - The mailmap to use
 * @param {string} args.name - Author name
 * @param {string} args.email - Author email
 * @returns {{name: string, email: string}}
 */
export function mailmapResolve({ mailmap, name, email }) {
  return mailmap.resolve(name, email)
}

// ---- helpers ----

/**
 * Parse a single mailmap line.
 * @private
 */
function parseMailmapLine(line) {
  // Regex patterns for mailmap formats:
  // 1. Proper Name <proper@email>
  // 2. <proper@email> <commit@email>
  // 3. Proper Name <proper@email> <commit@email>
  // 4. Proper Name <proper@email> Commit Name <commit@email>

  const emailRe = /<([^>]+)>/g
  const emails = []
  let match
  while ((match = emailRe.exec(line)) !== null) {
    emails.push({ email: match[1], index: match.index, end: emailRe.lastIndex })
  }

  if (emails.length === 0) return null

  if (emails.length === 1) {
    // Format 1: Proper Name <proper@email>
    const realName = line.slice(0, emails[0].index).trim() || null
    return {
      realName,
      realEmail: emails[0].email,
      replaceName: null,
      replaceEmail: emails[0].email.toLowerCase(),
    }
  }

  if (emails.length >= 2) {
    const beforeFirst = line.slice(0, emails[0].index).trim()
    const betweenEmails = line.slice(emails[0].end, emails[1].index).trim()

    if (!beforeFirst && !betweenEmails) {
      // Format 2: <proper@email> <commit@email>
      return {
        realName: null,
        realEmail: emails[0].email,
        replaceName: null,
        replaceEmail: emails[1].email.toLowerCase(),
      }
    }

    if (beforeFirst && !betweenEmails) {
      // Format 3: Proper Name <proper@email> <commit@email>
      return {
        realName: beforeFirst,
        realEmail: emails[0].email,
        replaceName: null,
        replaceEmail: emails[1].email.toLowerCase(),
      }
    }

    if (beforeFirst && betweenEmails) {
      // Format 4: Proper Name <proper@email> Commit Name <commit@email>
      return {
        realName: beforeFirst,
        realEmail: emails[0].email,
        replaceName: betweenEmails,
        replaceEmail: emails[1].email.toLowerCase(),
      }
    }
  }

  return null
}
