// @ts-check
import '../typedefs.js'

import { FileSystem } from '../models/FileSystem.js'
import { _readObject } from '../storage/readObject.js'
import { _writeObject } from '../storage/writeObject.js'
import { assertParameter } from '../utils/assertParameter.js'
import { discoverGitdir } from '../utils/discoverGitdir.js'
import { join } from '../utils/join.js'

/**
 * Check if a blob's content appears to be binary.
 * Equivalent to libgit2's `git_blob_is_binary`.
 *
 * Uses the same heuristic as git: looks for null bytes in the first 8000 bytes.
 *
 * @param {object} args
 * @param {FsClient} args.fs - a file system client
 * @param {string} [args.dir] - The working tree directory path
 * @param {string} [args.gitdir=join(dir, '.git')] - The git directory path
 * @param {string} args.oid - The blob OID
 * @param {object} [args.cache] - a cache object
 * @returns {Promise<boolean>}
 */
export async function blobIsBinary({
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

    const { object } = await _readObject({ fs, cache, gitdir: updatedGitdir, oid })
    const checkLen = Math.min(object.length, 8000)
    for (let i = 0; i < checkLen; i++) {
      if (object[i] === 0) return true
    }
    return false
  } catch (err) {
    err.caller = 'git.blobIsBinary'
    throw err
  }
}

/**
 * Get the size of a blob without reading its full content.
 * Equivalent to libgit2's `git_blob_rawsize`.
 *
 * @param {object} args
 * @param {FsClient} args.fs - a file system client
 * @param {string} [args.dir] - The working tree directory path
 * @param {string} [args.gitdir=join(dir, '.git')] - The git directory path
 * @param {string} args.oid - The blob OID
 * @param {object} [args.cache] - a cache object
 * @returns {Promise<number>} Size in bytes
 */
export async function blobSize({
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

    const { object } = await _readObject({ fs, cache, gitdir: updatedGitdir, oid })
    return object.length
  } catch (err) {
    err.caller = 'git.blobSize'
    throw err
  }
}

/**
 * Create a blob from a file in the working directory.
 * Equivalent to libgit2's `git_blob_create_from_workdir`.
 *
 * @param {object} args
 * @param {FsClient} args.fs - a file system client
 * @param {string} [args.dir] - The working tree directory path
 * @param {string} [args.gitdir=join(dir, '.git')] - The git directory path
 * @param {string} args.filepath - Path relative to dir
 * @param {object} [args.cache] - a cache object
 * @returns {Promise<string>} The blob OID
 */
export async function blobCreateFromWorkdir({
  fs: _fs,
  dir,
  gitdir = join(dir, '.git'),
  filepath,
  cache = {},
}) {
  try {
    assertParameter('fs', _fs)
    assertParameter('dir', dir)
    assertParameter('gitdir', gitdir)
    assertParameter('filepath', filepath)
    const fs = new FileSystem(_fs)
    const updatedGitdir = await discoverGitdir({ fsp: fs, dotgit: gitdir })

    const content = await fs._readFile(join(dir, filepath))
    const oid = await _writeObject({
      fs,
      gitdir: updatedGitdir,
      type: 'blob',
      object: Buffer.from(content),
    })
    return oid
  } catch (err) {
    err.caller = 'git.blobCreateFromWorkdir'
    throw err
  }
}
