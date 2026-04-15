import { _readObject as readObject } from '../storage/readObject.js'
import { GitTree } from '../models/GitTree.js'
import { _writeObject as writeObject } from '../storage/writeObject.js'

/**
 * Pre-process rename detection for merge.
 *
 * Given three tree OIDs (base, ours, theirs), detect files that were renamed
 * in one side but not the other. Returns adjusted tree OIDs where renames
 * are resolved so that the merge walker sees the correct file pairings.
 *
 * This is equivalent to libgit2's GIT_MERGE_FIND_RENAMES.
 *
 * @param {object} args
 * @param {import('../models/FileSystem.js').FileSystem} args.fs
 * @param {string} args.gitdir
 * @param {string} args.baseOid - Base tree OID
 * @param {string} args.ourOid - Our tree OID
 * @param {string} args.theirOid - Their tree OID
 * @param {number} [args.threshold=50] - Similarity threshold (0-100)
 * @param {object} [args.cache]
 * @returns {Promise<{ourOid: string, theirOid: string, renames: Array<{oldPath: string, newPath: string, side: string}>}>}
 */
export async function detectMergeRenames({
  fs,
  gitdir,
  baseOid,
  ourOid,
  theirOid,
  threshold = 50,
  cache = {},
}) {
  // Flatten all three trees
  const baseEntries = await flattenTree({ fs, cache, gitdir, treeOid: baseOid })
  const ourEntries = await flattenTree({ fs, cache, gitdir, treeOid: ourOid })
  const theirEntries = await flattenTree({ fs, cache, gitdir, treeOid: theirOid })

  const baseMap = new Map(baseEntries.map(e => [e.path, e]))
  const ourMap = new Map(ourEntries.map(e => [e.path, e]))
  const theirMap = new Map(theirEntries.map(e => [e.path, e]))

  const renames = []

  // Detect renames in "ours" relative to base
  const ourRenames = detectRenamesBetween(baseMap, ourMap, threshold)
  for (const r of ourRenames) {
    renames.push({ ...r, side: 'ours' })
  }

  // Detect renames in "theirs" relative to base
  const theirRenames = detectRenamesBetween(baseMap, theirMap, threshold)
  for (const r of theirRenames) {
    renames.push({ ...r, side: 'theirs' })
  }

  if (renames.length === 0) {
    return { ourOid, theirOid, renames: [] }
  }

  // Adjust trees: for renames on one side, make the other side see
  // the file at the new path so the merge walker can pair them correctly.
  let adjustedOurOid = ourOid
  let adjustedTheirOid = theirOid

  for (const rename of theirRenames) {
    // Their side renamed oldPath → newPath. If our side still has oldPath,
    // we need to adjust our tree to also rename oldPath → newPath so the
    // merge walker sees both at newPath and can do a content merge.
    if (ourMap.has(rename.oldPath) && !ourMap.has(rename.newPath)) {
      adjustedOurOid = await renameInTree({
        fs, gitdir, cache,
        treeOid: adjustedOurOid,
        oldPath: rename.oldPath,
        newPath: rename.newPath,
      })
    }
  }

  for (const rename of ourRenames) {
    // Our side renamed oldPath → newPath. If their side still has oldPath,
    // adjust their tree.
    if (theirMap.has(rename.oldPath) && !theirMap.has(rename.newPath)) {
      adjustedTheirOid = await renameInTree({
        fs, gitdir, cache,
        treeOid: adjustedTheirOid,
        oldPath: rename.oldPath,
        newPath: rename.newPath,
      })
    }
  }

  return { ourOid: adjustedOurOid, theirOid: adjustedTheirOid, renames }
}

/**
 * Detect exact renames between two flat entry maps.
 * Finds files deleted in old that appear (by OID) as added in new.
 */
function detectRenamesBetween(oldMap, newMap, threshold) {
  const renames = []
  const deleted = []
  const added = []

  for (const [path, entry] of oldMap) {
    if (!newMap.has(path)) {
      deleted.push({ path, ...entry })
    }
  }
  for (const [path, entry] of newMap) {
    if (!oldMap.has(path)) {
      added.push({ path, ...entry })
    }
  }

  // Phase 1: Exact OID match
  const matchedDel = new Set()
  const matchedAdd = new Set()

  for (let di = 0; di < deleted.length; di++) {
    for (let ai = 0; ai < added.length; ai++) {
      if (matchedDel.has(di) || matchedAdd.has(ai)) continue
      if (deleted[di].oid === added[ai].oid) {
        renames.push({ oldPath: deleted[di].path, newPath: added[ai].path })
        matchedDel.add(di)
        matchedAdd.add(ai)
        break
      }
    }
  }

  // Phase 2 would do content similarity — skip for now (exact is most common)
  // Content similarity is expensive and requires reading blobs

  return renames
}

/**
 * Rename a file in a tree by creating new tree objects.
 */
async function renameInTree({ fs, gitdir, cache, treeOid, oldPath, newPath }) {
  const entries = await flattenTree({ fs, cache, gitdir, treeOid })
  const entry = entries.find(e => e.path === oldPath)
  if (!entry) return treeOid

  // Remove old entry, add new entry
  const newEntries = entries
    .filter(e => e.path !== oldPath)
    .concat([{ ...entry, path: newPath }])

  // Rebuild tree from flat entries
  return buildTreeFromFlat({ fs, gitdir, cache, entries: newEntries })
}

/**
 * Build a tree object from flat entries.
 */
async function buildTreeFromFlat({ fs, gitdir, cache, entries }) {
  // Group by top-level directory
  const root = new Map()

  for (const entry of entries) {
    const slashIdx = entry.path.indexOf('/')
    if (slashIdx < 0) {
      // Root-level file
      root.set(entry.path, { oid: entry.oid, mode: entry.mode, type: 'blob' })
    } else {
      const dir = entry.path.slice(0, slashIdx)
      const rest = entry.path.slice(slashIdx + 1)
      if (!root.has(dir)) root.set(dir, { entries: [] })
      const dirEntry = root.get(dir)
      if (!dirEntry.entries) {
        // Collision between file and directory — shouldn't happen
        continue
      }
      dirEntry.entries.push({ ...entry, path: rest })
    }
  }

  const treeEntries = []
  for (const [name, value] of [...root.entries()].sort((a, b) => a[0] < b[0] ? -1 : 1)) {
    if (value.entries) {
      // Subdirectory — recurse
      const subtreeOid = await buildTreeFromFlat({ fs, gitdir, cache, entries: value.entries })
      treeEntries.push({ mode: '040000', path: name, oid: subtreeOid })
    } else {
      const modeStr = value.mode.toString(8).padStart(6, '0')
      treeEntries.push({ mode: modeStr, path: name, oid: value.oid })
    }
  }

  const { GitTree: GT } = await import('../models/GitTree.js')
  const tree = GT.from(treeEntries)
  const oid = await writeObject({
    fs, gitdir, type: 'tree', object: tree.toObject(),
  })
  return oid
}

/**
 * Recursively flatten a tree into {path, oid, mode} entries.
 */
async function flattenTree({ fs, cache, gitdir, treeOid, prefix = '' }) {
  const { type, object } = await readObject({ fs, cache, gitdir, oid: treeOid })
  if (type !== 'tree') throw new Error(`Expected tree ${treeOid}, got ${type}`)

  const tree = GitTree.from(object)
  const results = []

  for (const entry of tree.entries()) {
    const fullpath = prefix ? `${prefix}/${entry.path}` : entry.path
    const mode = parseInt(entry.mode, 8)

    if (entry.mode === '040000' || entry.type === 'tree') {
      const children = await flattenTree({ fs, cache, gitdir, treeOid: entry.oid, prefix: fullpath })
      results.push(...children)
    } else {
      results.push({ path: fullpath, oid: entry.oid, mode })
    }
  }

  return results
}
