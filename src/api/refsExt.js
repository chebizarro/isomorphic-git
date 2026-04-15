// @ts-check
import '../typedefs.js'

import { GitRefManager } from '../managers/GitRefManager.js'
import { FileSystem } from '../models/FileSystem.js'
import { assertParameter } from '../utils/assertParameter.js'
import { discoverGitdir } from '../utils/discoverGitdir.js'
import { join } from '../utils/join.js'

/**
 * Iterate refs matching a glob pattern.
 * Equivalent to libgit2's `git_reference_foreach_glob`.
 *
 * @param {object} args
 * @param {FsClient} args.fs - a file system client
 * @param {string} [args.dir] - The working tree directory path
 * @param {string} [args.gitdir=join(dir, '.git')] - The git directory path
 * @param {string} [args.pattern='refs/**'] - Glob pattern to match
 * @returns {Promise<Array<{ref: string, oid: string}>>}
 */
export async function foreachRef({
  fs: _fs,
  dir,
  gitdir = join(dir, '.git'),
  pattern = 'refs/**',
}) {
  try {
    assertParameter('fs', _fs)
    assertParameter('gitdir', gitdir)
    const fs = new FileSystem(_fs)
    const updatedGitdir = await discoverGitdir({ fsp: fs, dotgit: gitdir })

    const results = []

    // Walk loose refs
    const refsDir = join(updatedGitdir, 'refs')
    await walkRefs(fs, refsDir, 'refs', pattern, updatedGitdir, results)

    // Also check packed-refs
    const packed = await fs.read(join(updatedGitdir, 'packed-refs'), { encoding: 'utf8' })
    if (packed) {
      for (const line of packed.split('\n')) {
        if (line.startsWith('#') || line.startsWith('^')) continue
        const parts = line.trim().split(' ')
        if (parts.length >= 2) {
          const [oid, ref] = parts
          if (globMatchRef(pattern, ref) && !results.find(r => r.ref === ref)) {
            results.push({ ref, oid })
          }
        }
      }
    }

    return results.sort((a, b) => a.ref.localeCompare(b.ref))
  } catch (err) {
    err.caller = 'git.foreachRef'
    throw err
  }
}

/**
 * Validate a ref name according to git rules.
 * Equivalent to libgit2's `git_reference_is_valid_name`.
 *
 * @param {string} name - The ref name to validate
 * @returns {boolean}
 */
export function refNameIsValid(name) {
  if (!name || name.length === 0) return false
  if (name.startsWith('.') || name.endsWith('.')) return false
  if (name.endsWith('.lock')) return false
  // No component can start with '.' or end with '.lock'
  const components = name.split('/')
  for (const c of components) {
    if (c.startsWith('.')) return false
    if (c.endsWith('.lock')) return false
    if (c.length === 0) return false // empty component = '//'
  }
  if (name.includes('..')) return false
  if (name.includes('//')) return false
  if (name.includes('@{')) return false
  if (name.includes('\\')) return false
  if (name.includes(' ')) return false
  if (name.includes('~')) return false
  if (name.includes('^')) return false
  if (name.includes(':')) return false
  if (name.includes('?')) return false
  if (name.includes('*')) return false
  if (name.includes('[')) return false
  for (let i = 0; i < name.length; i++) {
    const c = name.charCodeAt(i)
    if (c < 0x20 || c === 0x7f) return false
  }
  return true
}

/**
 * Resolve a symbolic ref to its target.
 * Equivalent to libgit2's `git_reference_symbolic_target`.
 *
 * @param {object} args
 * @param {FsClient} args.fs - a file system client
 * @param {string} [args.dir] - The working tree directory path
 * @param {string} [args.gitdir=join(dir, '.git')] - The git directory path
 * @param {string} args.ref - The symbolic ref to resolve
 * @returns {Promise<string|null>} The target ref, or null if not a symbolic ref
 */
export async function symbolicRefTarget({
  fs: _fs,
  dir,
  gitdir = join(dir, '.git'),
  ref,
}) {
  try {
    assertParameter('fs', _fs)
    assertParameter('gitdir', gitdir)
    assertParameter('ref', ref)
    const fs = new FileSystem(_fs)
    const updatedGitdir = await discoverGitdir({ fsp: fs, dotgit: gitdir })

    const content = await fs.read(join(updatedGitdir, ref), { encoding: 'utf8' })
    if (!content) return null
    const trimmed = content.trim()
    if (trimmed.startsWith('ref:')) {
      return trimmed.slice(4).trim()
    }
    return null
  } catch (err) {
    err.caller = 'git.symbolicRefTarget'
    throw err
  }
}

// ---- helpers ----

async function walkRefs(fs, currentDir, prefix, pattern, gitdir, results) {
  try {
    const entries = await fs.readdir(currentDir)
    if (!entries) return
    for (const entry of entries) {
      const refPath = `${prefix}/${entry}`
      const fullPath = join(currentDir, entry)
      const content = await fs.read(fullPath, { encoding: 'utf8' })
      if (content !== null) {
        const trimmed = content.trim()
        if (/^[0-9a-f]{40}$/.test(trimmed)) {
          if (globMatchRef(pattern, refPath)) {
            results.push({ ref: refPath, oid: trimmed })
          }
        } else if (trimmed.startsWith('ref:')) {
          // symbolic ref — resolve it
          try {
            const oid = await GitRefManager.resolve({ fs, gitdir, ref: refPath })
            if (globMatchRef(pattern, refPath)) {
              results.push({ ref: refPath, oid })
            }
          } catch (e) { /* broken ref */ }
        } else {
          // might be a directory
          await walkRefs(fs, fullPath, refPath, pattern, gitdir, results)
        }
      } else {
        // Directory
        await walkRefs(fs, fullPath, refPath, pattern, gitdir, results)
      }
    }
  } catch (e) {
    // dir doesn't exist
  }
}

function globMatchRef(pattern, ref) {
  const re = pattern
    .replace(/\*\*/g, '<<<DOUBLESTAR>>>')
    .replace(/\*/g, '[^/]*')
    .replace(/<<<DOUBLESTAR>>>/g, '.*')
    .replace(/\?/g, '[^/]')
  return new RegExp('^' + re + '$').test(ref)
}
