// @ts-check
import '../typedefs.js'

import { FileSystem } from '../models/FileSystem.js'
import { _indexPack } from '../commands/indexPack.js'
import { assertParameter } from '../utils/assertParameter.js'
import { discoverGitdir } from '../utils/discoverGitdir.js'
import { join } from '../utils/join.js'

/**
 * Streaming packfile indexer.
 * Equivalent to libgit2's `git_indexer` API.
 *
 * Allows writing pack data incrementally and then finalizing
 * the index. This wraps the existing indexPack functionality
 * with a streaming-compatible interface.
 */
export class Indexer {
  /**
   * @param {object} args
   * @param {FileSystem} args.fs
   * @param {string} args.gitdir
   * @param {object} [args.cache]
   * @param {function} [args.onProgress]
   */
  constructor({ fs, gitdir, cache = {}, onProgress }) {
    this._fs = fs
    this._gitdir = gitdir
    this._cache = cache
    this._onProgress = onProgress
    this._chunks = []
    this._finalized = false
  }

  /**
   * Append pack data to the indexer.
   * Equivalent to `git_indexer_append`.
   *
   * @param {Uint8Array} data - Pack data chunk
   */
  append(data) {
    if (this._finalized) {
      throw new Error('Indexer already finalized')
    }
    this._chunks.push(Buffer.from(data))
  }

  /**
   * Finalize the index.
   * Writes the pack file and generates the index.
   * Equivalent to `git_indexer_commit`.
   *
   * @returns {Promise<{oids: string[]}>} Indexed object OIDs
   */
  async commit() {
    if (this._finalized) {
      throw new Error('Indexer already finalized')
    }
    this._finalized = true

    // Concatenate all chunks into a pack file
    const packData = Buffer.concat(this._chunks)

    // Write the pack file to the objects/pack directory
    const packDir = join(this._gitdir, 'objects', 'pack')
    try { await this._fs.mkdir(packDir) } catch (e) { /* exists */ }

    // Generate a temporary filename
    const tmpName = `pack-indexer-${Date.now()}.pack`
    const packPath = join(packDir, tmpName)
    await this._fs.write(packPath, packData)

    // Use existing indexPack to process it
    const result = await _indexPack({
      fs: this._fs,
      cache: this._cache,
      gitdir: this._gitdir,
      filepath: `objects/pack/${tmpName}`,
      onProgress: this._onProgress,
    })

    return result
  }

  /**
   * Get the number of chunks appended so far.
   * @returns {number}
   */
  get chunkCount() {
    return this._chunks.length
  }
}

/**
 * Create a new streaming indexer.
 * Equivalent to libgit2's `git_indexer_new`.
 *
 * @param {object} args
 * @param {FsClient} args.fs - a file system client
 * @param {string} [args.dir] - The working tree directory path
 * @param {string} [args.gitdir=join(dir, '.git')] - The git directory path
 * @param {function} [args.onProgress] - Progress callback
 * @param {object} [args.cache] - a cache object
 * @returns {Promise<Indexer>}
 */
export async function indexerNew({
  fs: _fs,
  dir,
  gitdir = join(dir, '.git'),
  onProgress,
  cache = {},
}) {
  try {
    assertParameter('fs', _fs)
    assertParameter('gitdir', gitdir)
    const fs = new FileSystem(_fs)
    const updatedGitdir = await discoverGitdir({ fsp: fs, dotgit: gitdir })

    return new Indexer({ fs, gitdir: updatedGitdir, cache, onProgress })
  } catch (err) {
    err.caller = 'git.indexerNew'
    throw err
  }
}
