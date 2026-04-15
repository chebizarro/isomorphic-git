// @ts-check
import '../typedefs.js'

import { GitRefManager } from '../managers/GitRefManager.js'
import { GitAnnotatedTag } from '../models/GitAnnotatedTag.js'
import { GitCommit } from '../models/GitCommit.js'
import { FileSystem } from '../models/FileSystem.js'
import { _readObject } from '../storage/readObject.js'
import { _writeObject } from '../storage/writeObject.js'
import { assertParameter } from '../utils/assertParameter.js'
import { discoverGitdir } from '../utils/discoverGitdir.js'
import { join } from '../utils/join.js'

/**
 * Iterate over all tags and call a callback for each.
 * Equivalent to libgit2's `git_tag_foreach`.
 *
 * @param {object} args
 * @param {FsClient} args.fs - a file system client
 * @param {string} [args.dir] - The working tree directory path
 * @param {string} [args.gitdir=join(dir, '.git')] - The git directory path
 * @param {function} args.callback - Called with (name, oid) for each tag
 * @param {object} [args.cache] - a cache object
 * @returns {Promise<void>}
 */
export async function tagForeach({
  fs: _fs,
  dir,
  gitdir = join(dir, '.git'),
  callback,
  cache = {},
}) {
  try {
    assertParameter('fs', _fs)
    assertParameter('gitdir', gitdir)
    assertParameter('callback', callback)
    const fs = new FileSystem(_fs)
    const updatedGitdir = await discoverGitdir({ fsp: fs, dotgit: gitdir })

    // List all refs under refs/tags/
    const tags = await GitRefManager.listRefs({
      fs,
      gitdir: updatedGitdir,
      filepath: 'refs/tags',
    })

    for (const name of tags) {
      const oid = await GitRefManager.resolve({
        fs,
        gitdir: updatedGitdir,
        ref: `refs/tags/${name}`,
      })
      await callback(name, oid)
    }
  } catch (err) {
    err.caller = 'git.tagForeach'
    throw err
  }
}

/**
 * Peel a tag to its target object.
 * Equivalent to libgit2's `git_tag_peel`.
 *
 * Follows tag chains until reaching a non-tag object.
 *
 * @param {object} args
 * @param {FsClient} args.fs - a file system client
 * @param {string} [args.dir] - The working tree directory path
 * @param {string} [args.gitdir=join(dir, '.git')] - The git directory path
 * @param {string} args.oid - The tag OID to peel
 * @param {object} [args.cache] - a cache object
 * @returns {Promise<{oid: string, type: string}>} The peeled object
 */
export async function tagPeel({
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

    let currentOid = oid
    for (let depth = 0; depth < 50; depth++) {
      const { type, object } = await _readObject({ fs, cache, gitdir: updatedGitdir, oid: currentOid })
      if (type !== 'tag') {
        return { oid: currentOid, type }
      }
      const tag = GitAnnotatedTag.from(object).parse()
      currentOid = tag.object
    }
    throw new Error('Tag peel exceeded maximum depth')
  } catch (err) {
    err.caller = 'git.tagPeel'
    throw err
  }
}

/**
 * Get the target OID of an annotated tag.
 * Equivalent to libgit2's `git_tag_target_id`.
 *
 * @param {object} args
 * @param {FsClient} args.fs - a file system client
 * @param {string} [args.dir] - The working tree directory path
 * @param {string} [args.gitdir=join(dir, '.git')] - The git directory path
 * @param {string} args.oid - The tag OID
 * @param {object} [args.cache] - a cache object
 * @returns {Promise<{targetOid: string, targetType: string, tagName: string, tagger: object, message: string}>}
 */
export async function tagTarget({
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

    const { type, object } = await _readObject({ fs, cache, gitdir: updatedGitdir, oid })
    if (type !== 'tag') {
      throw new Error(`Object ${oid} is not a tag (is ${type})`)
    }
    const tag = GitAnnotatedTag.from(object).parse()
    return {
      targetOid: tag.object,
      targetType: tag.type,
      tagName: tag.tag,
      tagger: tag.tagger,
      message: tag.message,
    }
  } catch (err) {
    err.caller = 'git.tagTarget'
    throw err
  }
}

/**
 * Create a tag from a raw tag buffer.
 * Equivalent to libgit2's `git_tag_create_from_buffer`.
 *
 * @param {object} args
 * @param {FsClient} args.fs - a file system client
 * @param {string} [args.dir] - The working tree directory path
 * @param {string} [args.gitdir=join(dir, '.git')] - The git directory path
 * @param {string|Uint8Array} args.buffer - Raw tag object content
 * @param {boolean} [args.force=false] - Override existing tag
 * @param {object} [args.cache] - a cache object
 * @returns {Promise<string>} The tag OID
 */
export async function tagCreateFromBuffer({
  fs: _fs,
  dir,
  gitdir = join(dir, '.git'),
  buffer,
  force = false,
  cache = {},
}) {
  try {
    assertParameter('fs', _fs)
    assertParameter('gitdir', gitdir)
    assertParameter('buffer', buffer)
    const fs = new FileSystem(_fs)
    const updatedGitdir = await discoverGitdir({ fsp: fs, dotgit: gitdir })

    const buf = typeof buffer === 'string' ? Buffer.from(buffer) : Buffer.from(buffer)

    // Write the tag object
    const oid = await _writeObject({
      fs,
      gitdir: updatedGitdir,
      type: 'tag',
      object: buf,
    })

    // Parse to get tag name and create the ref
    const tag = GitAnnotatedTag.from(buf).parse()
    const ref = `refs/tags/${tag.tag}`

    if (!force) {
      try {
        await GitRefManager.resolve({ fs, gitdir: updatedGitdir, ref })
        throw new Error(`Tag ${tag.tag} already exists. Use force to overwrite.`)
      } catch (e) {
        if (e.message.includes('already exists')) throw e
        // NotFoundError means we can create it
      }
    }

    await GitRefManager.writeRef({ fs, gitdir: updatedGitdir, ref, value: oid })
    return oid
  } catch (err) {
    err.caller = 'git.tagCreateFromBuffer'
    throw err
  }
}
