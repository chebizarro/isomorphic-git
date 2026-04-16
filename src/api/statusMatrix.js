// @ts-check
import '../typedefs.js'

import { STAGE } from '../commands/STAGE.js'
import { TREE } from '../commands/TREE.js'
import { WORKDIR } from '../commands/WORKDIR.js'
import { _walk } from '../commands/walk.js'
import { GitIgnoreManager } from '../managers/GitIgnoreManager.js'
import { FileSystem } from '../models/FileSystem.js'
import { assertParameter } from '../utils/assertParameter.js'
import { discoverGitdir } from '../utils/discoverGitdir.js'
import { join } from '../utils/join.js'
import { worthWalking } from '../utils/worthWalking.js'
import { _readObject } from '../storage/readObject.js'
import { GitRefManager } from '../managers/GitRefManager.js'
import { GitIndexManager } from '../managers/GitIndexManager.js'
import { resolveCommit } from '../utils/resolveCommit.js'

/**
 * Efficiently get the status of multiple files at once.
 *
 * The returned `StatusMatrix` is admittedly not the easiest format to read.
 * However it conveys a large amount of information in dense format that should make it easy to create reports about the current state of the repository;
 * without having to do multiple, time-consuming dimorphic-git calls.
 * My hope is that the speed and flexibility of the function will make up for the learning curve of interpreting the return value.
 *
 * ```js live
 * // get the status of all the files in 'src'
 * let status = await git.statusMatrix({
 *   fs,
 *   dir: '/tutorial',
 *   filter: f => f.startsWith('src/')
 * })
 * console.log(status)
 * ```
 *
 * ```js live
 * // get the status of all the JSON and Markdown files
 * let status = await git.statusMatrix({
 *   fs,
 *   dir: '/tutorial',
 *   filter: f => f.endsWith('.json') || f.endsWith('.md')
 * })
 * console.log(status)
 * ```
 *
 * The result is returned as a 2D array.
 * The outer array represents the files and/or blobs in the repo, in alphabetical order.
 * The inner arrays describe the status of the file:
 * the first value is the filepath, and the next three are integers
 * representing the HEAD status, WORKDIR status, and STAGE status of the entry.
 *
 * ```js
 * // example StatusMatrix
 * [
 *   ["a.txt", 0, 2, 0], // new, untracked
 *   ["b.txt", 0, 2, 2], // added, staged
 *   ["c.txt", 0, 2, 3], // added, staged, with unstaged changes
 *   ["d.txt", 1, 1, 1], // unmodified
 *   ["e.txt", 1, 2, 1], // modified, unstaged
 *   ["f.txt", 1, 2, 2], // modified, staged
 *   ["g.txt", 1, 2, 3], // modified, staged, with unstaged changes
 *   ["h.txt", 1, 0, 1], // deleted, unstaged
 *   ["i.txt", 1, 0, 0], // deleted, staged
 *   ["j.txt", 1, 2, 0], // deleted, staged, with unstaged-modified changes (new file of the same name)
 *   ["k.txt", 1, 1, 0], // deleted, staged, with unstaged changes (new file of the same name)
 * ]
 * ```
 *
 * - The HEAD status is either absent (0) or present (1).
 * - The WORKDIR status is either absent (0), identical to HEAD (1), or different from HEAD (2).
 * - The STAGE status is either absent (0), identical to HEAD (1), identical to WORKDIR (2), or different from WORKDIR (3).
 *
 * ```ts
 * type Filename      = string
 * type HeadStatus    = 0 | 1
 * type WorkdirStatus = 0 | 1 | 2
 * type StageStatus   = 0 | 1 | 2 | 3
 *
 * type StatusRow     = [Filename, HeadStatus, WorkdirStatus, StageStatus]
 *
 * type StatusMatrix  = StatusRow[]
 * ```
 *
 * > Think of the natural progression of file modifications as being from HEAD (previous) -> WORKDIR (current) -> STAGE (next).
 * > Then HEAD is "version 1", WORKDIR is "version 2", and STAGE is "version 3".
 * > Then, imagine a "version 0" which is before the file was created.
 * > Then the status value in each column corresponds to the oldest version of the file it is identical to.
 * > (For a file to be identical to "version 0" means the file is deleted.)
 *
 * Here are some examples of queries you can answer using the result:
 *
 * #### Q: What files have been deleted?
 * ```js
 * const FILE = 0, WORKDIR = 2
 *
 * const filenames = (await statusMatrix({ dir }))
 *   .filter(row => row[WORKDIR] === 0)
 *   .map(row => row[FILE])
 * ```
 *
 * #### Q: What files have unstaged changes?
 * ```js
 * const FILE = 0, WORKDIR = 2, STAGE = 3
 *
 * const filenames = (await statusMatrix({ dir }))
 *   .filter(row => row[WORKDIR] !== row[STAGE])
 *   .map(row => row[FILE])
 * ```
 *
 * #### Q: What files have been modified since the last commit?
 * ```js
 * const FILE = 0, HEAD = 1, WORKDIR = 2
 *
 * const filenames = (await statusMatrix({ dir }))
 *   .filter(row => row[HEAD] !== row[WORKDIR])
 *   .map(row => row[FILE])
 * ```
 *
 * #### Q: What files will NOT be changed if I commit right now?
 * ```js
 * const FILE = 0, HEAD = 1, STAGE = 3
 *
 * const filenames = (await statusMatrix({ dir }))
 *   .filter(row => row[HEAD] === row[STAGE])
 *   .map(row => row[FILE])
 * ```
 *
 * For reference, here are all possible combinations:
 *
 * | HEAD | WORKDIR | STAGE | `git status --short` equivalent |
 * | ---- | ------- | ----- | ------------------------------- |
 * | 0    | 0       | 0     | ``                              |
 * | 0    | 0       | 3     | `AD`                            |
 * | 0    | 2       | 0     | `??`                            |
 * | 0    | 2       | 2     | `A `                            |
 * | 0    | 2       | 3     | `AM`                            |
 * | 1    | 0       | 0     | `D `                            |
 * | 1    | 0       | 1     | ` D`                            |
 * | 1    | 0       | 3     | `MD`                            |
 * | 1    | 1       | 0     | `D ` + `??`                     |
 * | 1    | 1       | 1     | ``                              |
 * | 1    | 1       | 3     | `MM`                            |
 * | 1    | 2       | 0     | `D ` + `??`                     |
 * | 1    | 2       | 1     | ` M`                            |
 * | 1    | 2       | 2     | `M `                            |
 * | 1    | 2       | 3     | `MM`                            |
 *
 * @param {object} args
 * @param {FsClient} args.fs - a file system client
 * @param {string} args.dir - The [working tree](dir-vs-gitdir.md) directory path
 * @param {string} [args.gitdir=join(dir, '.git')] - [required] The [git directory](dir-vs-gitdir.md) path
 * @param {string} [args.ref = 'HEAD'] - Optionally specify a different commit to compare against the workdir and stage instead of the HEAD
 * @param {string[]} [args.filepaths = ['.']] - Limit the query to the given files and directories
 * @param {function(string): boolean} [args.filter] - Filter the results to only those whose filepath matches a function.
 * @param {object} [args.cache] - a [cache](cache.md) object
 * @param {boolean} [args.ignored = false] - include ignored files in the result
 *
 * @returns {Promise<Array<StatusRow>>} Resolves with a status matrix, described below.
 * @see StatusRow
 */
export async function statusMatrix({
  fs: _fs,
  dir,
  gitdir = join(dir, '.git'),
  ref = 'HEAD',
  filepaths = ['.'],
  filter,
  cache = {},
  ignored: shouldIgnore = false,
  detectRenames = false,
}) {
  try {
    assertParameter('fs', _fs)
    assertParameter('gitdir', gitdir)
    assertParameter('ref', ref)

    const fs = new FileSystem(_fs)
    const updatedGitdir = await discoverGitdir({ fsp: fs, dotgit: gitdir })
    const matrix = await _walk({
      fs,
      cache,
      dir,
      gitdir: updatedGitdir,
      trees: [TREE({ ref }), WORKDIR(), STAGE()],
      map: async function(filepath, [head, workdir, stage]) {
        // Ignore ignored files, but only if they are not already tracked.
        if (!head && !stage && workdir) {
          if (!shouldIgnore) {
            const isIgnored = await GitIgnoreManager.isIgnored({
              fs,
              dir,
              filepath,
            })
            if (isIgnored) {
              return null
            }
          }
        }
        // match against base paths
        if (!filepaths.some(base => worthWalking(filepath, base))) {
          return null
        }
        // Late filter against file names
        if (filter) {
          if (!filter(filepath)) return
        }

        const [headType, workdirType, stageType] = await Promise.all([
          head && head.type(),
          workdir && workdir.type(),
          stage && stage.type(),
        ])

        const isBlob = [headType, workdirType, stageType].includes('blob')

        // For now, bail on directories unless the file is also a blob in another tree
        if ((headType === 'tree' || headType === 'special') && !isBlob) return
        if (headType === 'commit') return null

        if ((workdirType === 'tree' || workdirType === 'special') && !isBlob)
          return

        if (stageType === 'commit') return null
        if ((stageType === 'tree' || stageType === 'special') && !isBlob) return

        // Figure out the oids for files, using the staged oid for the working dir oid if the stats match.
        const headOid = headType === 'blob' ? await head.oid() : undefined
        const stageOid = stageType === 'blob' ? await stage.oid() : undefined
        let workdirOid
        if (
          headType !== 'blob' &&
          workdirType === 'blob' &&
          stageType !== 'blob'
        ) {
          // We don't actually NEED the sha. Any sha will do
          // TODO: update this logic to handle N trees instead of just 3.
          workdirOid = '42'
        } else if (workdirType === 'blob') {
          workdirOid = await workdir.oid()
        }
        const entry = [undefined, headOid, workdirOid, stageOid]
        const result = entry.map(value => entry.indexOf(value))
        result.shift() // remove leading undefined entry
        return [filepath, ...result]
      },
    })

    // When detectRenames is enabled, find files that were deleted from HEAD
    // and added to the index, then check if any additions match deletions
    // by content (exact OID match or similarity). Augment matrix with renames.
    if (detectRenames && matrix.length > 0) {
      // head=1,stage=0 → deleted from HEAD; head=0,stage≠0 → added to index
      const deleted = [] // {filepath, idx}
      const added = []   // {filepath, idx}
      for (let i = 0; i < matrix.length; i++) {
        const [fp, h, w, s] = matrix[i]
        if (h === 1 && s === 0) deleted.push({ filepath: fp, idx: i })
        if (h === 0 && s !== 0) added.push({ filepath: fp, idx: i })
      }

      if (deleted.length > 0 && added.length > 0) {
        // Collect OIDs for deleted (from HEAD tree) and added (from index)
        let headTree = null
        try {
          const headOid = await GitRefManager.resolve({ fs, gitdir: updatedGitdir, ref })
          const resolved = await resolveCommit({ fs, cache, gitdir: updatedGitdir, oid: headOid })
          headTree = resolved.commit.parse().tree
        } catch (e) { /* empty repo */ }
        // headTree already set above

        const renames = new Map() // newPath → oldPath

        if (headTree) {
          // Build a map of deleted paths to their OIDs from the HEAD tree
          const deletedOids = new Map()
          for (const del of deleted) {
            try {
              const oid = await _findOidInTree({ fs, cache, gitdir: updatedGitdir, tree: headTree, filepath: del.filepath })
              if (oid) deletedOids.set(del.filepath, oid)
            } catch (e) { /* skip */ }
          }

          // Build a map of added paths to their OIDs from the index
          const addedOids = new Map()
          await GitIndexManager.acquire({ fs, gitdir: updatedGitdir, cache }, async function(index) {
            for (const add of added) {
              const entry = index.entriesMap.get(add.filepath)
              if (entry) addedOids.set(add.filepath, entry.oid)
            }
          })

          // Phase 1: Exact OID match (100% similarity renames)
          const matchedDeleted = new Set()
          const matchedAdded = new Set()
          for (const [delPath, delOid] of deletedOids) {
            for (const [addPath, addOid] of addedOids) {
              if (matchedAdded.has(addPath)) continue
              if (delOid === addOid) {
                renames.set(addPath, delPath)
                matchedDeleted.add(delPath)
                matchedAdded.add(addPath)
                break
              }
            }
          }

          // Phase 2: Content similarity for remaining unmatched
          const threshold = typeof detectRenames === 'number' ? detectRenames : 50
          const unmatchedDel = [...deletedOids].filter(([p]) => !matchedDeleted.has(p))
          const unmatchedAdd = [...addedOids].filter(([p]) => !matchedAdded.has(p))

          if (unmatchedDel.length > 0 && unmatchedAdd.length > 0) {
            // Read content for similarity comparison
            const readBlob = async (oid) => {
              try {
                const { object } = await _readObject({ fs, cache, gitdir: updatedGitdir, oid })
                return object
              } catch (e) { return null }
            }

            for (const [delPath, delOid] of unmatchedDel) {
              const delContent = await readBlob(delOid)
              if (!delContent) continue
              let bestMatch = null
              let bestSim = threshold

              for (const [addPath, addOid] of unmatchedAdd) {
                if (matchedAdded.has(addPath)) continue
                const addContent = await readBlob(addOid)
                if (!addContent) continue
                const sim = _computeSimilarity(delContent, addContent)
                if (sim > bestSim) {
                  bestSim = sim
                  bestMatch = addPath
                }
              }

              if (bestMatch) {
                renames.set(bestMatch, delPath)
                matchedDeleted.add(delPath)
                matchedAdded.add(bestMatch)
              }
            }
          }
        }

        // Augment matrix: add oldPath as 5th element for renamed files
        if (renames.size > 0) {
          // Remove deleted entries that were matched as renames
          const deletedPaths = new Set(renames.values())
          const filtered = matrix.filter(([fp]) => !deletedPaths.has(fp))
          for (let i = 0; i < filtered.length; i++) {
            const oldPath = renames.get(filtered[i][0])
            if (oldPath) {
              filtered[i] = [...filtered[i], oldPath]
            }
          }
          return filtered
        }
      }
    }

    return matrix
  } catch (err) {
    err.caller = 'git.statusMatrix'
    throw err
  }
}

/** @private Find a blob OID in a tree by filepath */
async function _findOidInTree({ fs, cache, gitdir, tree, filepath }) {
  const parts = filepath.split('/')
  let currentTree = tree
  for (let i = 0; i < parts.length; i++) {
    const { object: treeBuf } = await _readObject({ fs, cache, gitdir, oid: currentTree })
    let found = false
    let idx = 0
    while (idx < treeBuf.length) {
      const spaceIdx = treeBuf.indexOf(0x20, idx)
      if (spaceIdx === -1) break
      const mode = treeBuf.slice(idx, spaceIdx).toString('utf8')
      const nullIdx = treeBuf.indexOf(0x00, spaceIdx + 1)
      if (nullIdx === -1) break
      const name = treeBuf.slice(spaceIdx + 1, nullIdx).toString('utf8')
      const oid = treeBuf.slice(nullIdx + 1, nullIdx + 21).toString('hex')
      idx = nullIdx + 21

      if (name === parts[i]) {
        if (i === parts.length - 1) return oid
        currentTree = oid
        found = true
        break
      }
    }
    if (!found) return null
  }
  return null
}

/** @private Compute similarity between two buffers (0-100) */
function _computeSimilarity(a, b) {
  if (a.length === 0 && b.length === 0) return 100
  if (a.length === 0 || b.length === 0) return 0
  // Use line-based comparison
  const aStr = a.toString('utf8')
  const bStr = b.toString('utf8')
  const aLines = new Set(aStr.split('\n'))
  const bLines = new Set(bStr.split('\n'))
  let common = 0
  for (const line of aLines) {
    if (bLines.has(line)) common++
  }
  const total = Math.max(aLines.size, bLines.size)
  return total === 0 ? 0 : Math.round((common / total) * 100)
}
