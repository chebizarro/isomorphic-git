import { _readObject } from '../storage/readObject.js'
import { GitTree } from '../models/GitTree.js'
import { GitIndexManager } from '../managers/GitIndexManager.js'

/**
 * Reset the index to match a given tree OID.
 * Clears the current index and populates it with entries from the tree.
 *
 * @param {object} args
 * @param {import('../models/FileSystem.js').FileSystem} args.fs
 * @param {object} args.cache
 * @param {string} args.gitdir
 * @param {string} args.treeOid - The tree OID to reset the index to
 */
export async function resetIndexToTree({ fs, cache, gitdir, treeOid }) {
  await GitIndexManager.acquire(
    { fs, gitdir, cache },
    async function(index) {
      index.clear()
      await addTreeToIndex({ fs, cache, gitdir, index, treeOid, prefix: '' })
    }
  )
}

async function addTreeToIndex({ fs, cache, gitdir, index, treeOid, prefix }) {
  const { type, object } = await _readObject({
    fs,
    cache,
    gitdir,
    oid: treeOid,
  })

  if (type !== 'tree') {
    throw new Error(`Expected tree object for ${treeOid}, got ${type}`)
  }

  const tree = GitTree.from(object)
  const entries = tree.entries()

  for (const entry of entries) {
    const fullpath = prefix ? `${prefix}/${entry.path}` : entry.path

    if (entry.mode === '040000' || entry.type === 'tree') {
      await addTreeToIndex({
        fs,
        cache,
        gitdir,
        index,
        treeOid: entry.oid,
        prefix: fullpath,
      })
    } else {
      const stats = {
        ctime: new Date(0),
        mtime: new Date(0),
        dev: 0,
        ino: 0,
        mode: parseInt(entry.mode, 8),
        uid: 0,
        gid: 0,
        size: 0,
      }
      index.insert({ filepath: fullpath, stats, oid: entry.oid })
    }
  }
}
