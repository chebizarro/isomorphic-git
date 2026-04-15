// @ts-check
import '../typedefs.js'

import { GitCommit } from '../models/GitCommit.js'
import { FileSystem } from '../models/FileSystem.js'
import { _readObject } from '../storage/readObject.js'
import { _packObjects } from '../commands/packObjects.js'
import { assertParameter } from '../utils/assertParameter.js'
import { discoverGitdir } from '../utils/discoverGitdir.js'
import { join } from '../utils/join.js'

/**
 * A builder for creating pack files programmatically.
 * Equivalent to libgit2's `git_packbuilder` API.
 *
 * Provides an incremental API for building pack files:
 * insert objects, then write the pack.
 */
export class PackBuilder {
  /**
   * @param {object} args
   * @param {FileSystem} args.fs
   * @param {string} args.gitdir
   * @param {object} [args.cache]
   */
  constructor({ fs, gitdir, cache = {} }) {
    this._fs = fs
    this._gitdir = gitdir
    this._cache = cache
    this._oids = new Set()
  }

  /**
   * Insert a single object into the pack builder.
   * @param {string} oid
   */
  insert(oid) {
    this._oids.add(oid)
  }

  /**
   * Insert a commit and optionally all objects it references (tree walk).
   * Equivalent to `git_packbuilder_insert_commit`.
   *
   * @param {string} oid - Commit OID
   * @param {boolean} [recursive=true] - Walk the tree and add all blobs/trees
   */
  async insertCommit(oid, recursive = true) {
    this._oids.add(oid)
    if (!recursive) return

    const { type, object } = await _readObject({
      fs: this._fs,
      cache: this._cache,
      gitdir: this._gitdir,
      oid,
    })
    if (type !== 'commit') return
    const commit = GitCommit.from(object).parse()
    await this._insertTree(commit.tree)
  }

  /**
   * Insert a tree and all its contents recursively.
   * Equivalent to `git_packbuilder_insert_tree`.
   *
   * @param {string} oid - Tree OID
   */
  async insertTree(oid) {
    await this._insertTree(oid)
  }

  /** @private */
  async _insertTree(oid) {
    if (this._oids.has(oid)) return
    this._oids.add(oid)

    const { object: treeBuf } = await _readObject({
      fs: this._fs,
      cache: this._cache,
      gitdir: this._gitdir,
      oid,
    })

    let i = 0
    while (i < treeBuf.length) {
      const spaceIdx = treeBuf.indexOf(0x20, i)
      if (spaceIdx === -1) break
      const mode = treeBuf.slice(i, spaceIdx).toString('utf8')
      const nullIdx = treeBuf.indexOf(0x00, spaceIdx + 1)
      if (nullIdx === -1) break
      const entryOid = treeBuf.slice(nullIdx + 1, nullIdx + 21).toString('hex')
      i = nullIdx + 21

      this._oids.add(entryOid)
      if (mode.startsWith('40') || mode === '40000') {
        await this._insertTree(entryOid)
      }
    }
  }

  /**
   * Get the number of objects inserted.
   * @returns {number}
   */
  get count() {
    return this._oids.size
  }

  /**
   * Get all inserted OIDs.
   * @returns {string[]}
   */
  get oids() {
    return [...this._oids]
  }

  /**
   * Write the pack file and return it.
   * Uses the existing packObjects infrastructure.
   *
   * @returns {Promise<{filename: string, packfile: Uint8Array}>}
   */
  async write() {
    const result = await _packObjects({
      fs: this._fs,
      cache: this._cache,
      gitdir: this._gitdir,
      oids: [...this._oids],
    })
    return result
  }
}

/**
 * Create a new PackBuilder instance.
 * Equivalent to libgit2's `git_packbuilder_new`.
 *
 * @param {object} args
 * @param {FsClient} args.fs - a file system client
 * @param {string} [args.dir] - The working tree directory path
 * @param {string} [args.gitdir=join(dir, '.git')] - The git directory path
 * @param {object} [args.cache] - a cache object
 * @returns {Promise<PackBuilder>}
 */
export async function packBuilderNew({
  fs: _fs,
  dir,
  gitdir = join(dir, '.git'),
  cache = {},
}) {
  try {
    assertParameter('fs', _fs)
    assertParameter('gitdir', gitdir)
    const fs = new FileSystem(_fs)
    const updatedGitdir = await discoverGitdir({ fsp: fs, dotgit: gitdir })

    return new PackBuilder({ fs, gitdir: updatedGitdir, cache })
  } catch (err) {
    err.caller = 'git.packBuilderNew'
    throw err
  }
}
