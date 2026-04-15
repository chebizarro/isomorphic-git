import { join } from './join.js'

/**
 * Recursively create directories (since FileSystem.mkdir doesn't support recursive).
 */
async function mkdirp(fs, dirpath) {
  // Check if directory already exists
  try {
    await fs.stat(dirpath)
    return // already exists
  } catch {
    // doesn't exist, create parent first
  }
  const parent = dirpath.slice(0, dirpath.lastIndexOf('/'))
  if (parent && parent !== dirpath) {
    await mkdirp(fs, parent)
  }
  try {
    await fs.mkdir(dirpath)
  } catch {
    // ignore if it already exists (race condition)
  }
}

/**
 * Append an entry to a ref's reflog.
 *
 * Format: `<old_oid> <new_oid> <name> <<email>> <timestamp> <tz>\t<message>\n`
 *
 * @param {object} args
 * @param {import('../models/FileSystem.js').FileSystem} args.fs
 * @param {string} args.gitdir
 * @param {string} args.ref - The ref name (e.g. 'HEAD', 'refs/heads/main')
 * @param {string} args.previousOid - The old OID (40 hex chars, or '0'.repeat(40) for new refs)
 * @param {string} args.oid - The new OID (40 hex chars)
 * @param {object} args.author - { name, email, timestamp, timezoneOffset }
 * @param {string} args.message - Reflog message (e.g. 'commit: initial commit')
 */
export async function appendReflog({
  fs,
  gitdir,
  ref,
  previousOid,
  oid,
  author,
  message,
}) {
  const ZERO_OID = '0'.repeat(40)
  const prev = previousOid || ZERO_OID
  const next = oid || ZERO_OID

  // Format timezone offset as +HHMM / -HHMM
  const offset = author.timezoneOffset || 0
  const sign = offset >= 0 ? '+' : '-'
  const absOffset = Math.abs(offset)
  const hours = String(Math.floor(absOffset / 60)).padStart(2, '0')
  const minutes = String(absOffset % 60).padStart(2, '0')
  const tz = `${sign}${hours}${minutes}`

  const ts = author.timestamp || Math.floor(Date.now() / 1000)
  const line = `${prev} ${next} ${author.name} <${author.email}> ${ts} ${tz}\t${message}\n`

  const reflogPath = join(gitdir, 'logs', ref)

  // Ensure parent directory exists (mkdir one level at a time since
  // FileSystem.mkdir doesn't support recursive option)
  const parentDir = reflogPath.slice(0, reflogPath.lastIndexOf('/'))
  await mkdirp(fs, parentDir)

  // Append to the reflog file
  const existing = await fs.read(reflogPath).catch(() => null)
  if (existing) {
    const content = existing.toString('utf8') + line
    await fs.write(reflogPath, content, 'utf8')
  } else {
    await fs.write(reflogPath, line, 'utf8')
  }
}
