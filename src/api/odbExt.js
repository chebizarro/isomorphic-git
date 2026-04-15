// @ts-check
import '../typedefs.js'

import { FileSystem } from '../models/FileSystem.js'
import { _readObject } from '../storage/readObject.js'
import { _writeObject } from '../storage/writeObject.js'
import { assertParameter } from '../utils/assertParameter.js'
import { discoverGitdir } from '../utils/discoverGitdir.js'
import { join } from '../utils/join.js'

/**
 * Custom Object Database backend.
 * Equivalent to libgit2's `git_odb_backend` API.
 *
 * Provides a way to register custom object storage backends
 * that can intercept read/write operations. This is useful for
 * implementing virtual filesystems, caching layers, or alternative
 * storage engines.
 */

// Module-level backend registry
const _customBackends = new Map()

/**
 * Register a custom ODB backend for a repository.
 *
 * A backend object must implement:
 * - read(oid): Promise<{type, object}|null> - Read an object
 * - write(type, object): Promise<string|null> - Write an object, return oid
 * - exists(oid): Promise<boolean> - Check if object exists
 *
 * @param {object} args
 * @param {string} args.gitdir - The git directory to register the backend for
 * @param {object} args.backend - The backend implementation
 * @param {number} [args.priority=1] - Priority (higher = checked first)
 * @returns {void}
 */
export function odbAddBackend({ gitdir, backend, priority = 1 }) {
  if (!gitdir) throw new Error('gitdir is required')
  if (!backend) throw new Error('backend is required')
  if (typeof backend.read !== 'function') throw new Error('Backend must implement read(oid)')
  if (typeof backend.exists !== 'function') throw new Error('Backend must implement exists(oid)')

  if (!_customBackends.has(gitdir)) {
    _customBackends.set(gitdir, [])
  }
  const backends = _customBackends.get(gitdir)
  backends.push({ backend, priority })
  backends.sort((a, b) => b.priority - a.priority)
}

/**
 * Remove all custom ODB backends for a repository.
 *
 * @param {object} args
 * @param {string} args.gitdir - The git directory
 * @returns {void}
 */
export function odbClearBackends({ gitdir }) {
  _customBackends.delete(gitdir)
}

/**
 * Get all registered backends for a repository.
 *
 * @param {object} args
 * @param {string} args.gitdir - The git directory
 * @returns {Array<{backend: object, priority: number}>}
 */
export function odbListBackends({ gitdir }) {
  return _customBackends.get(gitdir) || []
}

/**
 * Read an object through custom backends first, falling back to default.
 * Equivalent to libgit2's `git_odb_read` with custom backends.
 *
 * @param {object} args
 * @param {FsClient} args.fs - a file system client
 * @param {string} [args.dir] - The working tree directory path
 * @param {string} [args.gitdir=join(dir, '.git')] - The git directory path
 * @param {string} args.oid - Object ID
 * @param {object} [args.cache] - a cache object
 * @returns {Promise<{type: string, object: Buffer}>}
 */
export async function odbRead({
  fs: _fs,
  dir,
  gitdir = join(dir, '.git'),
  oid,
  cache = {},
}) {
  try {
    assertParameter('fs', _fs)
    assertParameter('gitdir', gitdir)
    assertParameter('oid', oid)
    const fs = new FileSystem(_fs)
    const updatedGitdir = await discoverGitdir({ fsp: fs, dotgit: gitdir })

    // Check custom backends first
    const backends = _customBackends.get(updatedGitdir) || []
    for (const { backend } of backends) {
      const result = await backend.read(oid)
      if (result) return result
    }

    // Fall back to default storage
    return await _readObject({ fs, cache, gitdir: updatedGitdir, oid })
  } catch (err) {
    err.caller = 'git.odbRead'
    throw err
  }
}

/**
 * Write an object through custom backends.
 * Equivalent to libgit2's `git_odb_write` with custom backends.
 *
 * @param {object} args
 * @param {FsClient} args.fs - a file system client
 * @param {string} [args.dir] - The working tree directory path
 * @param {string} [args.gitdir=join(dir, '.git')] - The git directory path
 * @param {string} args.type - Object type ('blob', 'tree', 'commit', 'tag')
 * @param {Uint8Array} args.object - Object content
 * @param {object} [args.cache] - a cache object
 * @returns {Promise<string>} The object OID
 */
export async function odbWrite({
  fs: _fs,
  dir,
  gitdir = join(dir, '.git'),
  type,
  object,
  cache = {},
}) {
  try {
    assertParameter('fs', _fs)
    assertParameter('gitdir', gitdir)
    assertParameter('type', type)
    assertParameter('object', object)
    const fs = new FileSystem(_fs)
    const updatedGitdir = await discoverGitdir({ fsp: fs, dotgit: gitdir })

    // Try custom backends first
    const backends = _customBackends.get(updatedGitdir) || []
    for (const { backend } of backends) {
      if (typeof backend.write === 'function') {
        const result = await backend.write(type, object)
        if (result) return result
      }
    }

    // Fall back to default storage
    return await _writeObject({
      fs,
      gitdir: updatedGitdir,
      type,
      object: Buffer.from(object),
    })
  } catch (err) {
    err.caller = 'git.odbWrite'
    throw err
  }
}

/**
 * Check if an object exists in any backend.
 * Equivalent to libgit2's `git_odb_exists` with custom backends.
 *
 * @param {object} args
 * @param {FsClient} args.fs - a file system client
 * @param {string} [args.dir] - The working tree directory path
 * @param {string} [args.gitdir=join(dir, '.git')] - The git directory path
 * @param {string} args.oid - Object ID
 * @param {object} [args.cache] - a cache object
 * @returns {Promise<boolean>}
 */
export async function odbExists({
  fs: _fs,
  dir,
  gitdir = join(dir, '.git'),
  oid,
  cache = {},
}) {
  try {
    assertParameter('fs', _fs)
    assertParameter('gitdir', gitdir)
    assertParameter('oid', oid)
    const fs = new FileSystem(_fs)
    const updatedGitdir = await discoverGitdir({ fsp: fs, dotgit: gitdir })

    // Check custom backends first
    const backends = _customBackends.get(updatedGitdir) || []
    for (const { backend } of backends) {
      if (await backend.exists(oid)) return true
    }

    // Fall back to default storage
    try {
      await _readObject({ fs, cache, gitdir: updatedGitdir, oid })
      return true
    } catch (e) {
      return false
    }
  } catch (err) {
    err.caller = 'git.odbExists'
    throw err
  }
}
