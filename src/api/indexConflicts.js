// @ts-check
import '../typedefs.js'

import { GitIndexManager } from '../managers/GitIndexManager.js'
import { FileSystem } from '../models/FileSystem.js'
import { assertParameter } from '../utils/assertParameter.js'
import { discoverGitdir } from '../utils/discoverGitdir.js'
import { join } from '../utils/join.js'

/**
 * Check if the index has any conflict entries (unmerged paths).
 * Equivalent to libgit2's `git_index_has_conflicts`.
 *
 * @param {object} args
 * @param {FsClient} args.fs - a file system client
 * @param {string} [args.dir] - The working tree directory path
 * @param {string} [args.gitdir=join(dir, '.git')] - The git directory path
 * @param {object} [args.cache] - a cache object
 * @returns {Promise<boolean>}
 */
export async function indexHasConflicts({
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

    let result = false
    await GitIndexManager.acquire(
      { fs, gitdir: updatedGitdir, cache, allowUnmerged: true },
      async function(index) {
        result = index.unmergedPaths.length > 0
      }
    )
    return result
  } catch (err) {
    err.caller = 'git.indexHasConflicts'
    throw err
  }
}

/**
 * Get the conflict entries (stage 1/2/3) for a given path.
 * Equivalent to libgit2's `git_index_conflict_get`.
 *
 * Returns null if the path has no conflicts, or an object with
 * `ancestor` (stage 1), `ours` (stage 2), and `theirs` (stage 3)
 * fields. Each field is either an entry object or null.
 *
 * @param {object} args
 * @param {FsClient} args.fs - a file system client
 * @param {string} [args.dir] - The working tree directory path
 * @param {string} [args.gitdir=join(dir, '.git')] - The git directory path
 * @param {string} args.filepath - The path to query
 * @param {object} [args.cache] - a cache object
 * @returns {Promise<{ancestor: ConflictEntry|null, ours: ConflictEntry|null, theirs: ConflictEntry|null}|null>}
 */
export async function indexConflictGet({
  fs: _fs,
  dir,
  gitdir = join(dir, '.git'),
  filepath,
  cache = {},
}) {
  try {
    assertParameter('fs', _fs)
    assertParameter('gitdir', gitdir)
    assertParameter('filepath', filepath)
    const fs = new FileSystem(_fs)
    const updatedGitdir = await discoverGitdir({ fsp: fs, dotgit: gitdir })

    let result = null
    await GitIndexManager.acquire(
      { fs, gitdir: updatedGitdir, cache, allowUnmerged: true },
      async function(index) {
        const entry = index.entriesMap.get(filepath)
        if (!entry || !entry.stages || entry.stages.length <= 1) return

        // stages[1] = ancestor, stages[2] = ours, stages[3] = theirs
        const ancestor = entry.stages[1] ? entryToConflict(entry.stages[1]) : null
        const ours = entry.stages[2] ? entryToConflict(entry.stages[2]) : null
        const theirs = entry.stages[3] ? entryToConflict(entry.stages[3]) : null

        if (ancestor || ours || theirs) {
          result = { ancestor, ours, theirs }
        }
      }
    )
    return result
  } catch (err) {
    err.caller = 'git.indexConflictGet'
    throw err
  }
}

/**
 * Add conflict entries (stage 1/2/3) for a given path.
 * Equivalent to libgit2's `git_index_conflict_add`.
 *
 * @param {object} args
 * @param {FsClient} args.fs - a file system client
 * @param {string} [args.dir] - The working tree directory path
 * @param {string} [args.gitdir=join(dir, '.git')] - The git directory path
 * @param {string} args.filepath - The path to add conflicts for
 * @param {object} [args.ancestor] - The stage 1 (ancestor) entry: { oid, mode }
 * @param {object} [args.ours] - The stage 2 (ours) entry: { oid, mode }
 * @param {object} [args.theirs] - The stage 3 (theirs) entry: { oid, mode }
 * @param {object} [args.cache] - a cache object
 * @returns {Promise<void>}
 */
export async function indexConflictAdd({
  fs: _fs,
  dir,
  gitdir = join(dir, '.git'),
  filepath,
  ancestor,
  ours,
  theirs,
  cache = {},
}) {
  try {
    assertParameter('fs', _fs)
    assertParameter('gitdir', gitdir)
    assertParameter('filepath', filepath)
    const fs = new FileSystem(_fs)
    const updatedGitdir = await discoverGitdir({ fsp: fs, dotgit: gitdir })

    await GitIndexManager.acquire(
      { fs, gitdir: updatedGitdir, cache, allowUnmerged: true },
      async function(index) {
        // Remove any existing stage-0 entry for this path
        if (index.entriesMap.has(filepath)) {
          const existing = index.entriesMap.get(filepath)
          if (existing.flags && existing.flags.stage === 0) {
            index.delete({ filepath })
          }
        }

        // Insert conflict stages (no stats needed for conflict entries)
        if (ancestor) {
          index.insert({
            filepath,
            oid: ancestor.oid,
            stage: 1,
          })
        }
        if (ours) {
          index.insert({
            filepath,
            oid: ours.oid,
            stage: 2,
          })
        }
        if (theirs) {
          index.insert({
            filepath,
            oid: theirs.oid,
            stage: 3,
          })
        }
      }
    )
  } catch (err) {
    err.caller = 'git.indexConflictAdd'
    throw err
  }
}

/**
 * Remove conflict entries for a given path (removes stages 1/2/3).
 * Equivalent to libgit2's `git_index_conflict_remove`.
 *
 * @param {object} args
 * @param {FsClient} args.fs - a file system client
 * @param {string} [args.dir] - The working tree directory path
 * @param {string} [args.gitdir=join(dir, '.git')] - The git directory path
 * @param {string} args.filepath - The path to remove conflicts for
 * @param {object} [args.cache] - a cache object
 * @returns {Promise<void>}
 */
export async function indexConflictRemove({
  fs: _fs,
  dir,
  gitdir = join(dir, '.git'),
  filepath,
  cache = {},
}) {
  try {
    assertParameter('fs', _fs)
    assertParameter('gitdir', gitdir)
    assertParameter('filepath', filepath)
    const fs = new FileSystem(_fs)
    const updatedGitdir = await discoverGitdir({ fsp: fs, dotgit: gitdir })

    await GitIndexManager.acquire(
      { fs, gitdir: updatedGitdir, cache, allowUnmerged: true },
      async function(index) {
        index.delete({ filepath })
      }
    )
  } catch (err) {
    err.caller = 'git.indexConflictRemove'
    throw err
  }
}

/**
 * Iterate all conflict entries in the index.
 * Equivalent to libgit2's `git_index_conflict_iterator`.
 *
 * Returns an array of { filepath, ancestor, ours, theirs } objects.
 *
 * @param {object} args
 * @param {FsClient} args.fs - a file system client
 * @param {string} [args.dir] - The working tree directory path
 * @param {string} [args.gitdir=join(dir, '.git')] - The git directory path
 * @param {object} [args.cache] - a cache object
 * @returns {Promise<Array<{filepath: string, ancestor: ConflictEntry|null, ours: ConflictEntry|null, theirs: ConflictEntry|null}>>}
 */
export async function indexConflictIterator({
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

    const conflicts = []
    await GitIndexManager.acquire(
      { fs, gitdir: updatedGitdir, cache, allowUnmerged: true },
      async function(index) {
        for (const filepath of index.unmergedPaths) {
          const entry = index.entriesMap.get(filepath)
          if (!entry || !entry.stages) continue

          const ancestor = entry.stages[1] ? entryToConflict(entry.stages[1]) : null
          const ours = entry.stages[2] ? entryToConflict(entry.stages[2]) : null
          const theirs = entry.stages[3] ? entryToConflict(entry.stages[3]) : null
          conflicts.push({ filepath, ancestor, ours, theirs })
        }
      }
    )
    return conflicts
  } catch (err) {
    err.caller = 'git.indexConflictIterator'
    throw err
  }
}

/**
 * Remove all conflict entries from the index, keeping only stage-0 entries.
 * Equivalent to libgit2's `git_index_conflict_cleanup`.
 *
 * @param {object} args
 * @param {FsClient} args.fs - a file system client
 * @param {string} [args.dir] - The working tree directory path
 * @param {string} [args.gitdir=join(dir, '.git')] - The git directory path
 * @param {object} [args.cache] - a cache object
 * @returns {Promise<void>}
 */
export async function indexConflictCleanup({
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

    await GitIndexManager.acquire(
      { fs, gitdir: updatedGitdir, cache, allowUnmerged: true },
      async function(index) {
        for (const filepath of [...index.unmergedPaths]) {
          index.delete({ filepath })
        }
      }
    )
  } catch (err) {
    err.caller = 'git.indexConflictCleanup'
    throw err
  }
}

// ---- helpers ----

function entryToConflict(entry) {
  return {
    oid: entry.oid,
    mode: entry.mode,
    path: entry.path,
  }
}
