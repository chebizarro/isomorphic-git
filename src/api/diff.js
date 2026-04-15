import '../typedefs.js'
import { FileSystem } from '../models/FileSystem.js'
import { GitIndexManager } from '../managers/GitIndexManager.js'
import { assertParameter } from '../utils/assertParameter.js'
import { discoverGitdir } from '../utils/discoverGitdir.js'
import { generateHunks } from '../utils/diff.js'
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
 * Compute line-level diff hunks between two refs for a specific file.
 *
 * @param {object} args
 * @param {FsClient} args.fs - a file system client
 * @param {string} [args.dir] - The working tree directory path
 * @param {string} [args.gitdir=join(dir,'.git')] - The git directory path
 * @param {string} args.oldRef - The old tree-ish (commit/tree OID or ref)
 * @param {string} args.newRef - The new tree-ish (commit/tree OID or ref)
 * @param {string} args.filepath - Path to the file within the repo
 * @param {number} [args.contextLines=3] - Number of context lines around changes
 * @param {object} [args.cache] - a cache object
 * @returns {Promise<{hunks: Array<{oldStart: number, oldLines: number, newStart: number, newLines: number, lines: string[]}>, oldContent: string, newContent: string}>}
 */
export async function diffFile({
  fs: _fs,
  dir,
  gitdir = join(dir, '.git'),
  oldRef,
  newRef,
  filepath,
  contextLines = 3,
  cache = {},
}) {
  try {
    assertParameter('fs', _fs)
    assertParameter('gitdir', gitdir)
    assertParameter('filepath', filepath)

    const fs = new FileSystem(_fs)
    gitdir = await discoverGitdir({ fsp: fs, dotgit: gitdir })

    const oldContent = oldRef
      ? await readFileFromRef({ fs, cache, gitdir, ref: oldRef, filepath })
      : ''
    const newContent = newRef
      ? await readFileFromRef({ fs, cache, gitdir, ref: newRef, filepath })
      : ''

    const hunks = generateHunks(oldContent, newContent, contextLines)

    return { hunks, oldContent, newContent }
  } catch (err) {
    err.caller = 'git.diffFile'
    throw err
  }
}

/**
 * Compute the diff between the git index and the working directory.
 *
 * This is equivalent to libgit2's `git_diff_index_to_workdir`.
 * Returns an array of DiffDelta objects describing modified, added (untracked),
 * and deleted files in the working directory relative to the index.
 *
 * @param {object} args
 * @param {FsClient} args.fs - a file system client
 * @param {string} args.dir - The working tree directory path
 * @param {string} [args.gitdir=join(dir,'.git')] - The git directory path
 * @param {string} [args.filter] - Optional filepath prefix filter
 * @param {boolean} [args.includeUntracked=false] - Include untracked files as ADDED
 * @param {object} [args.cache] - a cache object
 * @returns {Promise<DiffDelta[]>} Array of diff deltas
 */
export async function diffIndexToWorkdir({
  fs: _fs,
  dir,
  gitdir = join(dir, '.git'),
  filter,
  includeUntracked = false,
  cache = {},
}) {
  try {
    assertParameter('fs', _fs)
    assertParameter('dir', dir)

    const fs = new FileSystem(_fs)
    gitdir = await discoverGitdir({ fsp: fs, dotgit: gitdir })

    const ZERO_OID = '0'.repeat(40)
    const deltas = []

    // Read the index
    const indexEntries = new Map()
    await GitIndexManager.acquire({ fs, gitdir, cache }, async function(index) {
      for (const entry of index) {
        if (filter && !entry.path.startsWith(filter)) continue
        indexEntries.set(entry.path, {
          oid: entry.oid,
          mode: entry.mode,
        })
      }
    })

    // Walk the working directory
    const workdirFiles = new Map()
    await walkWorkdir(fs, dir, '', filter, workdirFiles)

    // Compare index entries against workdir
    for (const [filepath, indexEntry] of indexEntries) {
      const workdirEntry = workdirFiles.get(filepath)

      if (!workdirEntry) {
        // File in index but not in workdir → deleted
        deltas.push({
          status: DELTA.DELETED,
          oldFile: { path: filepath, oid: indexEntry.oid, mode: indexEntry.mode, size: 0 },
          newFile: { path: filepath, oid: ZERO_OID, mode: 0, size: 0 },
        })
      } else {
        // Both exist — check if content differs
        // Quick check: if stat size differs, it's definitely modified
        // For a thorough check, hash the workdir file and compare OIDs
        const workdirOid = await hashWorkdirFile(fs, dir, filepath)
        if (workdirOid !== indexEntry.oid) {
          deltas.push({
            status: DELTA.MODIFIED,
            oldFile: { path: filepath, oid: indexEntry.oid, mode: indexEntry.mode, size: 0 },
            newFile: { path: filepath, oid: workdirOid, mode: workdirEntry.mode, size: workdirEntry.size },
          })
        }
        workdirFiles.delete(filepath)
      }
    }

    // Remaining workdir files are untracked
    if (includeUntracked) {
      for (const [filepath, workdirEntry] of workdirFiles) {
        const workdirOid = await hashWorkdirFile(fs, dir, filepath)
        deltas.push({
          status: DELTA.ADDED,
          oldFile: { path: filepath, oid: ZERO_OID, mode: 0, size: 0 },
          newFile: { path: filepath, oid: workdirOid, mode: workdirEntry.mode, size: workdirEntry.size },
        })
      }
    }

    // Sort by path
    deltas.sort((a, b) => {
      const pa = a.oldFile.path || a.newFile.path
      const pb = b.oldFile.path || b.newFile.path
      return pa < pb ? -1 : pa > pb ? 1 : 0
    })

    return deltas
  } catch (err) {
    err.caller = 'git.diffIndexToWorkdir'
    throw err
  }
}

/**
 * Compute per-file and aggregate diff statistics.
 *
 * Equivalent to `git diff --stat`. Returns insertions and deletions
 * for each file, plus aggregate totals.
 *
 * @param {object} args
 * @param {FsClient} args.fs - a file system client
 * @param {string} [args.dir] - The working tree directory path
 * @param {string} [args.gitdir=join(dir,'.git')] - The git directory path
 * @param {string} args.oldRef - The old tree-ish
 * @param {string} args.newRef - The new tree-ish
 * @param {object} [args.cache] - a cache object
 * @returns {Promise<{files: Array<{path: string, insertions: number, deletions: number, binary: boolean}>, totalInsertions: number, totalDeletions: number, filesChanged: number}>}
 */
export async function diffStat({
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

    const deltas = await diffTrees({ fs: _fs, dir, gitdir, oldRef, newRef, cache })

    const files = []
    let totalInsertions = 0
    let totalDeletions = 0

    for (const delta of deltas) {
      const filepath = delta.newFile.path || delta.oldFile.path

      // Try to read content and generate hunks
      try {
        const oldContent = delta.status !== DELTA.ADDED
          ? await readBlobByOid({ fs, cache, gitdir, oid: delta.oldFile.oid })
          : ''
        const newContent = delta.status !== DELTA.DELETED
          ? await readBlobByOid({ fs, cache, gitdir, oid: delta.newFile.oid })
          : ''

        // Check for binary content
        if (isBinary(oldContent) || isBinary(newContent)) {
          files.push({ path: filepath, insertions: 0, deletions: 0, binary: true })
          continue
        }

        const hunks = generateHunks(oldContent, newContent, 0)
        let insertions = 0
        let deletions = 0
        for (const hunk of hunks) {
          for (const line of hunk.lines) {
            if (line.startsWith('+')) insertions++
            else if (line.startsWith('-')) deletions++
          }
        }

        files.push({ path: filepath, insertions, deletions, binary: false })
        totalInsertions += insertions
        totalDeletions += deletions
      } catch {
        // If we can't read the blob (e.g. submodule), treat as binary
        files.push({ path: filepath, insertions: 0, deletions: 0, binary: true })
      }
    }

    return {
      files,
      totalInsertions,
      totalDeletions,
      filesChanged: files.length,
    }
  } catch (err) {
    err.caller = 'git.diffStat'
    throw err
  }
}

/**
 * Generate a unified diff patch string from two refs.
 *
 * Output format is compatible with `git apply` and `patch(1)`.
 *
 * @param {object} args
 * @param {FsClient} args.fs - a file system client
 * @param {string} [args.dir] - The working tree directory path
 * @param {string} [args.gitdir=join(dir,'.git')] - The git directory path
 * @param {string} args.oldRef - The old tree-ish
 * @param {string} args.newRef - The new tree-ish
 * @param {number} [args.contextLines=3] - Number of context lines
 * @param {object} [args.cache] - a cache object
 * @returns {Promise<string>} Unified diff patch text
 */
export async function formatPatch({
  fs: _fs,
  dir,
  gitdir = join(dir, '.git'),
  oldRef,
  newRef,
  contextLines = 3,
  cache = {},
}) {
  try {
    assertParameter('fs', _fs)
    assertParameter('gitdir', gitdir)
    assertParameter('oldRef', oldRef)
    assertParameter('newRef', newRef)

    const fs = new FileSystem(_fs)
    gitdir = await discoverGitdir({ fsp: fs, dotgit: gitdir })

    const deltas = await diffTrees({ fs: _fs, dir, gitdir, oldRef, newRef, cache })

    const patches = []

    for (const delta of deltas) {
      const filepath = delta.newFile.path || delta.oldFile.path
      const oldPath = delta.status === DELTA.ADDED ? '/dev/null' : `a/${filepath}`
      const newPath = delta.status === DELTA.DELETED ? '/dev/null' : `b/${filepath}`

      try {
        const oldContent = delta.status !== DELTA.ADDED
          ? await readBlobByOid({ fs, cache, gitdir, oid: delta.oldFile.oid })
          : ''
        const newContent = delta.status !== DELTA.DELETED
          ? await readBlobByOid({ fs, cache, gitdir, oid: delta.newFile.oid })
          : ''

        if (isBinary(oldContent) || isBinary(newContent)) {
          patches.push(
            `diff --git a/${filepath} b/${filepath}\n` +
            `Binary files ${oldPath} and ${newPath} differ\n`
          )
          continue
        }

        const hunks = generateHunks(oldContent, newContent, contextLines)
        if (hunks.length === 0) continue

        let patch = `diff --git a/${filepath} b/${filepath}\n`
        if (delta.status === DELTA.ADDED) {
          patch += `new file mode ${delta.newFile.mode.toString(8).padStart(6, '0')}\n`
        } else if (delta.status === DELTA.DELETED) {
          patch += `deleted file mode ${delta.oldFile.mode.toString(8).padStart(6, '0')}\n`
        }
        patch += `--- ${oldPath}\n`
        patch += `+++ ${newPath}\n`

        for (const hunk of hunks) {
          patch += `@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@\n`
          for (const line of hunk.lines) {
            patch += line + '\n'
          }
        }

        patches.push(patch)
      } catch {
        patches.push(
          `diff --git a/${filepath} b/${filepath}\n` +
          `Binary files ${oldPath} and ${newPath} differ\n`
        )
      }
    }

    return patches.join('')
  } catch (err) {
    err.caller = 'git.formatPatch'
    throw err
  }
}

/**
 * Detect renames and copies in a set of diff deltas.
 *
 * Pass the output of `diffTrees` through this function to detect renames
 * and copies. Uses exact OID matching first, then falls back to content
 * similarity scoring.
 *
 * Equivalent to libgit2's `git_diff_find_similar` with `GIT_DIFF_FIND_RENAMES`.
 *
 * @param {object} args
 * @param {FsClient} args.fs - a file system client
 * @param {string} [args.dir] - The working tree directory path
 * @param {string} [args.gitdir=join(dir,'.git')] - The git directory path
 * @param {DiffDelta[]} args.deltas - Array of diff deltas from diffTrees
 * @param {number} [args.threshold=50] - Similarity threshold 0-100 (default 50%)
 * @param {boolean} [args.findCopies=false] - Also detect copies (more expensive)
 * @param {object} [args.cache] - a cache object
 * @returns {Promise<DiffDelta[]>} Updated deltas with RENAMED/COPIED status
 */
export async function findRenames({
  fs: _fs,
  dir,
  gitdir = join(dir, '.git'),
  deltas,
  threshold = 50,
  findCopies = false,
  cache = {},
}) {
  try {
    assertParameter('fs', _fs)
    assertParameter('deltas', deltas)

    const fs = new FileSystem(_fs)
    gitdir = await discoverGitdir({ fsp: fs, dotgit: gitdir })

    const result = [...deltas]

    // Separate deletions and additions
    const deletions = result.filter(d => d.status === DELTA.DELETED)
    const additions = result.filter(d => d.status === DELTA.ADDED)

    if (deletions.length === 0 || additions.length === 0) return result

    const matched = new Set() // indices of matched additions
    const matchedDeletions = new Set() // indices of matched deletions

    // Phase 1: Exact OID matches (renames where content is identical)
    for (let di = 0; di < deletions.length; di++) {
      if (matchedDeletions.has(di)) continue
      const del = deletions[di]
      for (let ai = 0; ai < additions.length; ai++) {
        if (matched.has(ai)) continue
        const add = additions[ai]
        if (del.oldFile.oid === add.newFile.oid) {
          // Exact rename
          const idx = result.indexOf(del)
          result[idx] = {
            status: DELTA.RENAMED,
            similarity: 100,
            oldFile: del.oldFile,
            newFile: add.newFile,
          }
          // Remove the addition
          const addIdx = result.indexOf(add)
          result.splice(addIdx, 1)
          matched.add(ai)
          matchedDeletions.add(di)
          break
        }
      }
    }

    // Phase 2: Content similarity for remaining unmatched pairs
    const remainingDeletions = deletions.filter((_, i) => !matchedDeletions.has(i))
    const remainingAdditions = additions.filter((_, i) => !matched.has(i))

    if (remainingDeletions.length > 0 && remainingAdditions.length > 0) {
      // Read content for all remaining files
      const ZERO_OID = '0'.repeat(40)
      const delContents = new Map()
      const addContents = new Map()

      for (const del of remainingDeletions) {
        if (del.oldFile.oid !== ZERO_OID) {
          try {
            delContents.set(del, await readBlobByOid({ fs, cache, gitdir, oid: del.oldFile.oid }))
          } catch { /* skip unreadable */ }
        }
      }
      for (const add of remainingAdditions) {
        if (add.newFile.oid !== ZERO_OID) {
          try {
            addContents.set(add, await readBlobByOid({ fs, cache, gitdir, oid: add.newFile.oid }))
          } catch { /* skip unreadable */ }
        }
      }

      // Score all pairs and find best matches
      const scores = []
      for (const [del, delContent] of delContents) {
        if (isBinary(delContent)) continue
        for (const [add, addContent] of addContents) {
          if (isBinary(addContent)) continue
          const similarity = computeSimilarity(delContent, addContent)
          if (similarity >= threshold) {
            scores.push({ del, add, similarity })
          }
        }
      }

      // Sort by similarity descending and greedily match
      scores.sort((a, b) => b.similarity - a.similarity)
      const usedDels = new Set()
      const usedAdds = new Set()

      for (const { del, add, similarity } of scores) {
        if (usedDels.has(del) || usedAdds.has(add)) continue
        usedDels.add(del)
        usedAdds.add(add)

        const idx = result.indexOf(del)
        if (idx >= 0) {
          result[idx] = {
            status: DELTA.RENAMED,
            similarity: Math.round(similarity),
            oldFile: del.oldFile,
            newFile: add.newFile,
          }
          const addIdx = result.indexOf(add)
          if (addIdx >= 0) result.splice(addIdx, 1)
        }
      }
    }

    // Phase 3: Copy detection (optional, more expensive)
    if (findCopies) {
      const ZERO_OID = '0'.repeat(40)
      const unmatched = result.filter(d => d.status === DELTA.ADDED)
      const sources = result.filter(d =>
        d.status === DELTA.UNMODIFIED || d.status === DELTA.MODIFIED || d.status === DELTA.RENAMED
      )

      for (const add of unmatched) {
        if (add.newFile.oid === ZERO_OID) continue
        let addContent
        try {
          addContent = await readBlobByOid({ fs, cache, gitdir, oid: add.newFile.oid })
        } catch { continue }
        if (isBinary(addContent)) continue

        let bestSimilarity = 0
        let bestSource = null

        for (const src of sources) {
          const srcOid = src.newFile.oid || src.oldFile.oid
          if (srcOid === ZERO_OID) continue

          if (srcOid === add.newFile.oid) {
            bestSimilarity = 100
            bestSource = src
            break
          }

          let srcContent
          try {
            srcContent = await readBlobByOid({ fs, cache, gitdir, oid: srcOid })
          } catch { continue }
          if (isBinary(srcContent)) continue

          const similarity = computeSimilarity(srcContent, addContent)
          if (similarity > bestSimilarity) {
            bestSimilarity = similarity
            bestSource = src
          }
        }

        if (bestSource && bestSimilarity >= threshold) {
          const idx = result.indexOf(add)
          if (idx >= 0) {
            result[idx] = {
              status: DELTA.COPIED,
              similarity: Math.round(bestSimilarity),
              oldFile: bestSource.newFile || bestSource.oldFile,
              newFile: add.newFile,
            }
          }
        }
      }
    }

    return result
  } catch (err) {
    err.caller = 'git.findRenames'
    throw err
  }
}

// ─── Private helpers ────────────────────────────────────────────────

/**
 * Read a blob's content as a UTF-8 string by OID.
 */
async function readBlobByOid({ fs, cache, gitdir, oid }) {
  const ZERO_OID = '0'.repeat(40)
  if (oid === ZERO_OID) return ''
  const { _readObject } = await import('../storage/readObject.js')
  const { object } = await _readObject({ fs, cache, gitdir, oid })
  return Buffer.from(object).toString('utf8')
}

/**
 * Check if content looks binary (contains null bytes in first 8000 chars).
 */
function isBinary(content) {
  const check = content.slice(0, 8000)
  return check.includes('\0')
}

/**
 * Compute similarity percentage between two strings using line-level comparison.
 * Returns 0-100.
 */
function computeSimilarity(a, b) {
  if (a === b) return 100
  if (!a || !b) return 0
  const aLines = a.split('\n')
  const bLines = b.split('\n')
  const maxLen = Math.max(aLines.length, bLines.length)
  if (maxLen === 0) return 100

  // Build a set of lines in both for fast lookup
  const aSet = new Map()
  for (const line of aLines) {
    aSet.set(line, (aSet.get(line) || 0) + 1)
  }

  let commonLines = 0
  const bUsed = new Map()
  for (const line of bLines) {
    const available = (aSet.get(line) || 0) - (bUsed.get(line) || 0)
    if (available > 0) {
      commonLines++
      bUsed.set(line, (bUsed.get(line) || 0) + 1)
    }
  }

  return (commonLines / maxLen) * 100
}

/**
 * Read a file's content from a ref (commit/tree).
 */
async function readFileFromRef({ fs, cache, gitdir, ref, filepath }) {
  const { _readObject } = await import('../storage/readObject.js')
  const treeOid = await resolveToTree({ fs, cache, gitdir, ref })
  const entries = await flattenTree({ fs, cache, gitdir, treeOid })
  const entry = entries.find(e => e.path === filepath)
  if (!entry) return ''
  const { object } = await _readObject({ fs, cache, gitdir, oid: entry.oid })
  return Buffer.from(object).toString('utf8')
}

/**
 * Recursively walk the working directory and collect file entries.
 */
async function walkWorkdir(fs, dir, prefix, filter, result) {
  const entries = await fs.readdir(join(dir, prefix))
  for (const name of entries) {
    if (name === '.git') continue
    const filepath = prefix ? `${prefix}/${name}` : name
    if (filter && !filepath.startsWith(filter) && !filter.startsWith(filepath)) continue

    const fullpath = join(dir, filepath)
    const stat = await fs.lstat(fullpath)

    if (stat.isDirectory()) {
      await walkWorkdir(fs, dir, filepath, filter, result)
    } else if (stat.isFile()) {
      if (filter && !filepath.startsWith(filter)) continue
      result.set(filepath, {
        mode: stat.mode,
        size: stat.size,
      })
    }
  }
}

/**
 * Hash a working directory file as a git blob to get its OID.
 */
async function hashWorkdirFile(fs, dir, filepath) {
  const { shasum } = await import('../utils/shasum.js')
  const content = await fs.read(join(dir, filepath))
  const header = `blob ${content.byteLength}\0`
  const full = Buffer.concat([Buffer.from(header), Buffer.from(content)])
  return shasum(full)
}

/**
 * Resolve a ref (commit OID, branch name, etc.) to a tree OID.
 * Supports revparse syntax like HEAD~1, main^2, etc.
 */
async function resolveToTree({ fs, cache, gitdir, ref }) {
  const { _readObject } = await import('../storage/readObject.js')
  const { GitRefManager } = await import('../managers/GitRefManager.js')
  const { GitCommit } = await import('../models/GitCommit.js')

  let oid

  // Check if ref contains revparse operators (~, ^)
  if (/[~^]/.test(ref)) {
    // Parse spec: split into base ref and operators
    let refEnd = ref.length
    for (let j = 0; j < ref.length; j++) {
      if (ref[j] === '~' || ref[j] === '^') {
        refEnd = j
        break
      }
    }
    const baseRef = ref.slice(0, refEnd)
    oid = await GitRefManager.resolve({ fs, gitdir, ref: baseRef })

    // Parse and apply operators
    let i = refEnd
    while (i < ref.length) {
      const ch = ref[i]
      i++
      let n = 0
      let hasDigit = false
      while (i < ref.length && ref[i] >= '0' && ref[i] <= '9') {
        n = n * 10 + (ref.charCodeAt(i) - 48)
        hasDigit = true
        i++
      }
      if (!hasDigit) n = 1

      if (ch === '~') {
        for (let step = 0; step < n; step++) {
          const { object } = await _readObject({ fs, cache, gitdir, oid })
          const commit = GitCommit.from(object)
          const { parent } = commit.parseHeaders()
          if (parent.length === 0) {
            throw new Error(`Cannot resolve '${ref}': commit ${oid} has no parent`)
          }
          oid = parent[0]
        }
      } else if (ch === '^') {
        if (n === 0) continue
        const { object } = await _readObject({ fs, cache, gitdir, oid })
        const commit = GitCommit.from(object)
        const { parent } = commit.parseHeaders()
        if (n - 1 >= parent.length) {
          throw new Error(`Cannot resolve '${ref}': commit ${oid} does not have parent ${n}`)
        }
        oid = parent[n - 1]
      }
    }
  } else {
    // Simple ref or OID
    try {
      oid = await GitRefManager.resolve({ fs, gitdir, ref })
    } catch {
      // ref might already be an OID
      oid = ref
    }
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
