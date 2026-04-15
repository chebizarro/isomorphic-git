// @ts-check
import '../typedefs.js'

import { GitConfigManager } from '../managers/GitConfigManager.js'
import { FileSystem } from '../models/FileSystem.js'
import { assertParameter } from '../utils/assertParameter.js'
import { discoverGitdir } from '../utils/discoverGitdir.js'
import { join } from '../utils/join.js'

/**
 * Parse a git signature string into its components.
 * Equivalent to libgit2's `git_signature_from_buffer`.
 *
 * Parses strings like: "Name <email> 1234567890 +0000"
 *
 * @param {string} raw - The raw signature string
 * @returns {{name: string, email: string, timestamp: number, timezoneOffset: number}|null}
 */
export function signatureFromBuffer(raw) {
  if (!raw || typeof raw !== 'string') return null

  const match = raw.match(/^(.+?)\s+<([^>]*)>\s+(\d+)\s+([+-]?\d{4})$/)
  if (!match) return null

  const [, name, email, timestampStr, tzStr] = match
  const timestamp = parseInt(timestampStr, 10)

  // Parse timezone: +0530 means 5 hours 30 minutes ahead of UTC
  const tzSign = tzStr.startsWith('-') ? -1 : 1
  const tzAbs = tzStr.replace(/[+-]/, '')
  const tzHours = parseInt(tzAbs.slice(0, 2), 10)
  const tzMinutes = parseInt(tzAbs.slice(2, 4), 10)
  const timezoneOffset = tzSign * (tzHours * 60 + tzMinutes)

  return { name: name.trim(), email, timestamp, timezoneOffset }
}

/**
 * Create a signature string from components.
 * Equivalent to libgit2's `git_signature_new`.
 *
 * @param {object} args
 * @param {string} args.name - Author/committer name
 * @param {string} args.email - Email address
 * @param {number} [args.timestamp] - Unix timestamp (defaults to now)
 * @param {number} [args.timezoneOffset=0] - Timezone offset in minutes
 * @returns {string} Formatted signature string
 */
export function signatureCreate({
  name,
  email,
  timestamp,
  timezoneOffset = 0,
}) {
  if (!timestamp) {
    timestamp = Math.floor(Date.now() / 1000)
  }

  const sign = timezoneOffset >= 0 ? '+' : '-'
  const abs = Math.abs(timezoneOffset)
  const hours = String(Math.floor(abs / 60)).padStart(2, '0')
  const minutes = String(abs % 60).padStart(2, '0')
  const tz = `${sign}${hours}${minutes}`

  return `${name} <${email}> ${timestamp} ${tz}`
}

/**
 * Get the default signature from git config (user.name and user.email).
 * Equivalent to libgit2's `git_signature_default`.
 *
 * @param {object} args
 * @param {FsClient} args.fs - a file system client
 * @param {string} [args.dir] - The working tree directory path
 * @param {string} [args.gitdir=join(dir, '.git')] - The git directory path
 * @returns {Promise<{name: string, email: string}|null>}
 */
export async function signatureDefault({
  fs: _fs,
  dir,
  gitdir = join(dir, '.git'),
}) {
  try {
    assertParameter('fs', _fs)
    assertParameter('gitdir', gitdir)
    const fs = new FileSystem(_fs)
    const updatedGitdir = await discoverGitdir({ fsp: fs, dotgit: gitdir })

    const config = await GitConfigManager.get({ fs, gitdir: updatedGitdir })
    const name = await config.get('user.name')
    const email = await config.get('user.email')

    if (!name || !email) return null
    return { name, email }
  } catch (err) {
    err.caller = 'git.signatureDefault'
    throw err
  }
}
