import '../typedefs.js'
import { FileSystem } from '../models/FileSystem.js'
import { assertParameter } from '../utils/assertParameter.js'
import { discoverGitdir } from '../utils/discoverGitdir.js'
import { join } from '../utils/join.js'

/**
 * Read the reflog for a given ref.
 *
 * Returns an array of reflog entries, newest first. Each entry contains
 * the old and new OIDs, the author who made the change, a timestamp,
 * and the reflog message.
 *
 * @param {object} args
 * @param {FsClient} args.fs - a file system client
 * @param {string} [args.dir] - The working tree directory path
 * @param {string} [args.gitdir=join(dir,'.git')] - The git directory path
 * @param {string} args.ref - The ref to read the reflog for (e.g. 'HEAD', 'refs/heads/main')
 * @returns {Promise<Array<{oid: string, previousOid: string, author: {name: string, email: string, timestamp: number, timezoneOffset: number}, message: string}>>}
 *
 * @example
 * const entries = await git.readReflog({ fs, dir, ref: 'HEAD' })
 * console.log(entries[0].message)
 */
export async function readReflog({
  fs: _fs,
  dir,
  gitdir = join(dir, '.git'),
  ref,
}) {
  assertParameter('fs', _fs)
  assertParameter('ref', ref)

  const fs = new FileSystem(_fs)
  gitdir = await discoverGitdir({ fsp: fs, dotgit: gitdir })

  const reflogPath = join(gitdir, 'logs', ref)
  if (!(await fs.exists(reflogPath))) {
    return []
  }

  const content = await fs.read(reflogPath, 'utf8')
  const lines = content.split('\n').filter(l => l.trim())

  const entries = []
  for (const line of lines) {
    const tabIdx = line.indexOf('\t')
    const message = tabIdx >= 0 ? line.slice(tabIdx + 1) : ''
    const meta = tabIdx >= 0 ? line.slice(0, tabIdx) : line

    // Format: <old_oid> <new_oid> <name> <email> <timestamp> <tz>
    // The name can contain spaces if formatted as "Name <email>",
    // but reflog uses a simpler format: the email is angle-bracketed
    const emailStart = meta.indexOf('<')
    const emailEnd = meta.indexOf('>', emailStart)

    let previousOid, oid, name, email, timestamp, timezoneOffset

    if (emailStart > 0 && emailEnd > emailStart) {
      const prefix = meta.slice(0, emailStart).trim()
      const parts = prefix.split(' ')
      previousOid = parts[0]
      oid = parts[1]
      name = parts.slice(2).join(' ')
      email = meta.slice(emailStart + 1, emailEnd)
      const after = meta.slice(emailEnd + 1).trim().split(' ')
      timestamp = parseInt(after[0], 10) || 0
      const tz = after[1] || '+0000'
      const tzSign = tz[0] === '-' ? -1 : 1
      const tzHours = parseInt(tz.slice(1, 3), 10) || 0
      const tzMinutes = parseInt(tz.slice(3, 5), 10) || 0
      timezoneOffset = tzSign * (tzHours * 60 + tzMinutes)
    } else {
      // Fallback: space-delimited (stash format without angle brackets)
      const parts = meta.split(' ')
      previousOid = parts[0]
      oid = parts[1]
      name = parts[2] || ''
      email = parts[3] || ''
      timestamp = parseInt(parts[4], 10) || 0
      const tz = parts[5] || '+0000'
      const tzSign = tz[0] === '-' ? -1 : 1
      const tzHours = parseInt(tz.slice(1, 3), 10) || 0
      const tzMinutes = parseInt(tz.slice(3, 5), 10) || 0
      timezoneOffset = tzSign * (tzHours * 60 + tzMinutes)
    }

    entries.push({
      oid,
      previousOid,
      author: { name, email, timestamp, timezoneOffset },
      message,
    })
  }

  // Return newest-first (git convention)
  entries.reverse()
  return entries
}
