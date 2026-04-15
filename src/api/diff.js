import '../typedefs.js'
import { FileSystem } from '../models/FileSystem.js'
import { assertParameter } from '../utils/assertParameter.js'
import { discoverGitdir } from '../utils/discoverGitdir.js'
import { join } from '../utils/join.js'
import { resolveCommit } from '../utils/resolveCommit.js'

// Delta status types — match libgit2 git_delta_t
export const DELTA = Object.freeze({
  UNMODIFIED: 0,
  ADDED: 1,
  DELETED: 2,
  MODIFIED: 3,
  RENAMED: 4,
  COPIED: 5,
  IGNORED: 6,
  UNTRACKED: 7,
  TYPECHANGE: 8,
  UNREADABLE: 9,
  CONFLICTED: 10,
})

/**
 * @typedef {Object} DiffFile
 * @property {string} path - File path relative to repo root
 * @property {string} oid - SHA-1 object id (or '0'.repeat(40) if absent)
 * @property {number} mode - File mode
 * @property {number} size - File size (0 if unknown)
 */

/**
 * @typedef {Object} DiffDelta
 * @property {number} status - One of the DELTA values
 * @property {DiffFile} oldFile - Description of the old side
 * @property {DiffFile} newFile - Description of the new side
 */

/**
 * Compute the diff between two trees (commits).
 *
 * This is equivalent to libgit2's `git_diff_tree_to_tree`.
 * Returns an array of DiffDelta objects describing added, deleted,
 * and modified files between the two trees.
 *
 * @param {object} args
 * @param {FsClient} args.fs - a file system client
 * @param {string} [args.dir] - The working tree directory path
 * @param {string} [args.gitdir=join(dir,'.git')] - The git directory path
 * @param {string} args.oldRef - The old tree-ish (commit/tree OID or ref)
 * @param {string} args.newRef - The new tree-ish (commit/tree OID or ref)
 * @param {object} [args.cache] - a cache object
 * @returns {Promise<DiffDelta[]>} Array of diff deltas
 *
 * @example
 * const deltas = await git.diffTrees({ fs, dir, oldRef: 'HEAD~1', newRef: 'HEAD' })
 * for (const d of deltas) {
 *   console.log(d.status, d.oldFile.path, d.newFile.path)
 * }
 */
export async function diffTrees({
  fs: _fs,
  dir,
  gitdir = join(dir, '.git'),
  oldRef,
  newRef,
  cache = {},
}) {
  try {
    assertParameter('fs', _fs)
    assertParameter('gitdir', gitdir)
    assertParameter('oldRef', oldRef)
    assertParameter('newRef', newRef)

    const fs = new FileSystem(_fs)
    gitdir = await discoverGitdir({ fsp: fs, dotgit: gitdir })

    // Resolve refs to tree OIDs
    const oldTreeOid = await resolveToTree({ fs, cache, gitdir, ref: oldRef })
    const newTreeOid = await resolveToTree({ fs, cache, gitdir, ref: newRef })

    // Walk both trees in parallel
    const oldEntries = await flattenTree({ fs, cache, gitdir, treeOid: oldTreeOid })
    const newEntries = await flattenTree({ fs, cache, gitdir, treeOid: newTreeOid })

    // Build maps for fast lookup
    const oldMap = new Map(oldEntries.map(e => [e.path, e]))
    const newMap = new Map(newEntries.map(e => [e.path, e]))

    // Collect all unique paths
    const allPaths = new Set([...oldMap.keys(), ...newMap.keys()])
    const deltas = []
    const ZERO_OID = '0'.repeat(40)

    for (const filepath of [...allPaths].sort()) {
      const oldEntry = oldMap.get(filepath)
      const newEntry = newMap.get(filepath)

      if (oldEntry && !newEntry) {
        // Deleted
        deltas.push({
          status: DELTA.DELETED,
          oldFile: {
            path: filepath,
            oid: oldEntry.oid,
            mode: oldEntry.mode,
            size: 0,
          },
          newFile: { path: filepath, oid: ZERO_OID, mode: 0, size: 0 },
        })
      } else if (!oldEntry && newEntry) {
        // Added
        deltas.push({
          status: DELTA.ADDED,
          oldFile: { path: filepath, oid: ZERO_OID, mode: 0, size: 0 },
          newFile: {
            path: filepath,
            oid: newEntry.oid,
            mode: newEntry.mode,
            size: 0,
          },
        })
      } else if (oldEntry && newEntry) {
        if (oldEntry.oid !== newEntry.oid || oldEntry.mode !== newEntry.mode) {
          // Check if it's a type change (e.g. blob -> tree)
          const oldIsTree = oldEntry.entryType === 'tree'
          const newIsTree = newEntry.entryType === 'tree'
          const status =
            oldIsTree !== newIsTree ? DELTA.TYPECHANGE : DELTA.MODIFIED

          deltas.push({
            status,
            oldFile: {
              path: filepath,
              oid: oldEntry.oid,
              mode: oldEntry.mode,
              size: 0,
            },
            newFile: {
              path: filepath,
              oid: newEntry.oid,
              mode: newEntry.mode,
              size: 0,
            },
          })
        }
        // else: UNMODIFIED — skip by default (matches libgit2 default behavior)
      }
    }

    return deltas
  } catch (err) {
    err.caller = 'git.diffTrees'
    throw err
  }
}

/**
 * Resolve a ref (commit OID, branch name, etc.) to a tree OID.
 */
async function resolveToTree({ fs, cache, gitdir, ref }) {
  const { _readObject } = await import('../storage/readObject.js')

  // First resolve ref to OID
  const { GitRefManager } = await import('../managers/GitRefManager.js')
  let oid
  try {
    oid = await GitRefManager.resolve({ fs, gitdir, ref })
  } catch {
    // ref might already be an OID
    oid = ref
  }

  // Read the object to determine type
  const { type, object } = await _readObject({ fs, cache, gitdir, oid })

  if (type === 'tree') {
    return oid
  }

  if (type === 'commit') {
    const content = Buffer.from(object).toString('utf8')
    const match = content.match(/^tree ([0-9a-f]{40})/m)
    if (match) return match[1]
    throw new Error(`Could not find tree in commit ${oid}`)
  }

  if (type === 'tag') {
    // Peel the tag
    const content = Buffer.from(object).toString('utf8')
    const match = content.match(/^object ([0-9a-f]{40})/m)
    if (match) return resolveToTree({ fs, cache, gitdir, ref: match[1] })
    throw new Error(`Could not peel tag ${oid}`)
  }

  throw new Error(`Cannot resolve ${oid} (type: ${type}) to a tree`)
}

/**
 * Recursively flatten a tree into an array of {path, oid, mode, entryType} entries (blobs only).
 */
async function flattenTree({ fs, cache, gitdir, treeOid, prefix = '' }) {
  const { _readObject } = await import('../storage/readObject.js')
  const { GitTree } = await import('../models/GitTree.js')

  const { type, object } = await _readObject({
    fs,
    cache,
    gitdir,
    oid: treeOid,
  })
  if (type !== 'tree') {
    throw new Error(`Expected tree ${treeOid}, got ${type}`)
  }

  const tree = GitTree.from(object)
  const results = []

  for (const entry of tree.entries()) {
    const fullpath = prefix ? `${prefix}/${entry.path}` : entry.path
    const mode = parseInt(entry.mode, 8)

    if (entry.mode === '040000' || entry.type === 'tree') {
      // Recurse into subtree
      const children = await flattenTree({
        fs,
        cache,
        gitdir,
        treeOid: entry.oid,
        prefix: fullpath,
      })
      results.push(...children)
    } else {
      results.push({
        path: fullpath,
        oid: entry.oid,
        mode,
        entryType: entry.type || 'blob',
      })
    }
  }

  return results
}
