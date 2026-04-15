import '../typedefs.js'
import { _findMergeBase } from '../commands/findMergeBase.js'
import { GitCommit } from '../models/GitCommit.js'
import { FileSystem } from '../models/FileSystem.js'
import { _readObject as readObject } from '../storage/readObject.js'
import { assertParameter } from '../utils/assertParameter.js'
import { discoverGitdir } from '../utils/discoverGitdir.js'
import { join } from '../utils/join.js'

/**
 * Count the number of unique commits between two commit objects.
 *
 * This is equivalent to libgit2's `git_graph_ahead_behind`.
 * Think of `ourOid` as "local" and `theirOid` as "upstream":
 * - `ahead`: commits in `ourOid` not reachable from `theirOid`
 * - `behind`: commits in `theirOid` not reachable from `ourOid`
 *
 * @param {object} args
 * @param {FsClient} args.fs - a file system client
 * @param {string} [args.dir] - The working tree directory path
 * @param {string} [args.gitdir=join(dir,'.git')] - The git directory path
 * @param {string} args.ourOid - The OID of the local commit
 * @param {string} args.theirOid - The OID of the upstream commit
 * @param {object} [args.cache] - a cache object
 * @returns {Promise<{ahead: number, behind: number}>}
 *
 * @example
 * const { ahead, behind } = await git.aheadBehind({
 *   fs, dir,
 *   ourOid: 'abc123...',
 *   theirOid: 'def456...',
 * })
 * console.log(`${ahead} ahead, ${behind} behind`)
 */
export async function aheadBehind({
  fs: _fs,
  dir,
  gitdir = join(dir, '.git'),
  ourOid,
  theirOid,
  cache = {},
}) {
  assertParameter('fs', _fs)
  assertParameter('ourOid', ourOid)
  assertParameter('theirOid', theirOid)

  const fs = new FileSystem(_fs)
  gitdir = await discoverGitdir({ fsp: fs, dotgit: gitdir })

  if (ourOid === theirOid) {
    return { ahead: 0, behind: 0 }
  }

  // Find merge base(s)
  const bases = await _findMergeBase({ fs, cache, gitdir, oids: [ourOid, theirOid] })
  const baseSet = new Set(bases)

  // Count commits from ourOid to the merge base (ahead)
  const ahead = await countCommitsTo({ fs, cache, gitdir, from: ourOid, stopAt: baseSet })

  // Count commits from theirOid to the merge base (behind)
  const behind = await countCommitsTo({ fs, cache, gitdir, from: theirOid, stopAt: baseSet })

  return { ahead, behind }
}

/**
 * Count unique commits reachable from `from` but not in `stopAt`.
 * Uses BFS to walk parents.
 */
async function countCommitsTo({ fs, cache, gitdir, from, stopAt }) {
  if (stopAt.has(from)) return 0

  let count = 0
  const visited = new Set()
  let queue = [from]

  while (queue.length > 0) {
    const nextQueue = []
    for (const oid of queue) {
      if (visited.has(oid) || stopAt.has(oid)) continue
      visited.add(oid)
      count++

      try {
        const { object } = await readObject({ fs, cache, gitdir, oid })
        const commit = GitCommit.from(object)
        const { parent } = commit.parseHeaders()
        for (const p of parent) {
          if (!visited.has(p) && !stopAt.has(p)) {
            nextQueue.push(p)
          }
        }
      } catch (err) {
        // Shallow or missing commit — stop walking this branch
      }
    }
    queue = nextQueue
  }

  return count
}
