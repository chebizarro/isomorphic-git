// @ts-check
import '../typedefs.js'

import { GitRefManager } from '../managers/GitRefManager.js'
import { GitCommit } from '../models/GitCommit.js'
import { FileSystem } from '../models/FileSystem.js'
import { _readObject } from '../storage/readObject.js'
import { assertParameter } from '../utils/assertParameter.js'
import { discoverGitdir } from '../utils/discoverGitdir.js'
import { join } from '../utils/join.js'

/**
 * Revwalk sorting modes matching libgit2's git_sort_t
 */
export const SORT = Object.freeze({
  NONE: 0,
  TOPOLOGICAL: 1 << 0,
  TIME: 1 << 1,
  REVERSE: 1 << 2,
})

/**
 * Create and execute a revision walker with configurable options.
 * Equivalent to libgit2's git_revwalk API.
 *
 * Unlike `log`, this provides more control over traversal:
 * - Push/hide specific refs
 * - Sort by topological order, time, or reverse
 * - First-parent-only traversal
 * - Limit results with count
 *
 * @param {object} args
 * @param {FsClient} args.fs - a file system client
 * @param {string} [args.dir] - The working tree directory path
 * @param {string} [args.gitdir=join(dir, '.git')] - The git directory path
 * @param {string[]} [args.include=['HEAD']] - Refs/OIDs to include (push)
 * @param {string[]} [args.exclude=[]] - Refs/OIDs to exclude (hide)
 * @param {number} [args.sort=SORT.TIME] - Sort mode (SORT.TOPOLOGICAL, SORT.TIME, SORT.REVERSE)
 * @param {boolean} [args.firstParentOnly=false] - Follow only first parent
 * @param {number} [args.count] - Maximum number of commits to return
 * @param {function} [args.map] - Optional transform function: (oid, commit) => result
 * @param {object} [args.cache] - a cache object
 * @returns {Promise<string[]|Array>} Array of OIDs (or mapped results)
 */
export async function revwalk({
  fs: _fs,
  dir,
  gitdir = join(dir, '.git'),
  include = ['HEAD'],
  exclude = [],
  sort = SORT.TIME,
  firstParentOnly = false,
  count,
  map,
  cache = {},
}) {
  try {
    assertParameter('fs', _fs)
    assertParameter('gitdir', gitdir)
    const fs = new FileSystem(_fs)
    const updatedGitdir = await discoverGitdir({ fsp: fs, dotgit: gitdir })

    // Resolve refs to OIDs
    const includeOids = new Set()
    for (const ref of include) {
      const oid = await GitRefManager.resolve({ fs, gitdir: updatedGitdir, ref })
      includeOids.add(oid)
    }

    const excludeOids = new Set()
    for (const ref of exclude) {
      try {
        const oid = await GitRefManager.resolve({ fs, gitdir: updatedGitdir, ref })
        excludeOids.add(oid)
        // Also exclude all ancestors of hidden commits
        await collectAncestors(fs, cache, updatedGitdir, oid, excludeOids)
      } catch (e) {
        // ref not found — skip
      }
    }

    // Walk the graph
    const visited = new Set()
    const result = []

    // Priority queue: [oid, timestamp] sorted by timestamp desc
    const queue = []
    for (const oid of includeOids) {
      if (!excludeOids.has(oid)) {
        const commit = await readCommitData(fs, cache, updatedGitdir, oid)
        if (commit) {
          queue.push({ oid, commit, timestamp: commit.committer.timestamp })
        }
      }
    }

    // Sort queue
    const sortByTime = (sort & SORT.TIME) || !(sort & SORT.TOPOLOGICAL)
    if (sortByTime) {
      queue.sort((a, b) => b.timestamp - a.timestamp)
    }

    while (queue.length > 0) {
      if (count !== undefined && result.length >= count) break

      // Pick next commit
      let idx = 0
      if (sortByTime) {
        // Find the one with the highest timestamp
        for (let i = 1; i < queue.length; i++) {
          if (queue[i].timestamp > queue[idx].timestamp) idx = i
        }
      }

      const { oid, commit } = queue.splice(idx, 1)[0]

      if (visited.has(oid)) continue
      visited.add(oid)

      if (excludeOids.has(oid)) continue

      // Add to results
      if (map) {
        const mapped = await map(oid, commit)
        if (mapped !== undefined && mapped !== null) {
          result.push(mapped)
        }
      } else {
        result.push(oid)
      }

      // Enqueue parents
      const parents = firstParentOnly
        ? (commit.parent ? [commit.parent[0]] : [])
        : (commit.parent || [])

      for (const parentOid of parents) {
        if (!visited.has(parentOid) && !excludeOids.has(parentOid)) {
          const parentCommit = await readCommitData(fs, cache, updatedGitdir, parentOid)
          if (parentCommit) {
            queue.push({
              oid: parentOid,
              commit: parentCommit,
              timestamp: parentCommit.committer.timestamp,
            })
          }
        }
      }
    }

    // Apply reverse if requested
    if (sort & SORT.REVERSE) {
      result.reverse()
    }

    return result
  } catch (err) {
    err.caller = 'git.revwalk'
    throw err
  }
}

/**
 * Read and parse a commit object.
 * @private
 */
async function readCommitData(fs, cache, gitdir, oid) {
  try {
    const { type, object } = await _readObject({ fs, cache, gitdir, oid })
    if (type !== 'commit') return null
    const commit = GitCommit.from(object)
    return commit.parse()
  } catch (e) {
    return null
  }
}

/**
 * Collect all ancestors of a commit into the set.
 * @private
 */
async function collectAncestors(fs, cache, gitdir, oid, set, maxDepth = 1000) {
  const queue = [oid]
  let depth = 0
  while (queue.length > 0 && depth < maxDepth) {
    const current = queue.shift()
    if (set.has(current)) continue
    set.add(current)
    depth++
    const commit = await readCommitData(fs, cache, gitdir, current)
    if (commit && commit.parent) {
      for (const p of commit.parent) {
        if (!set.has(p)) queue.push(p)
      }
    }
  }
}
