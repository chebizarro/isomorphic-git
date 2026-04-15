// @ts-check
import '../typedefs.js'

import { _findMergeBase } from '../commands/findMergeBase.js'
import { GitRefManager } from '../managers/GitRefManager.js'
import { GitCommit } from '../models/GitCommit.js'
import { FileSystem } from '../models/FileSystem.js'
import { _readObject } from '../storage/readObject.js'
import { assertParameter } from '../utils/assertParameter.js'
import { discoverGitdir } from '../utils/discoverGitdir.js'
import { join } from '../utils/join.js'

/**
 * Determine ahead/behind counts between two refs.
 * Equivalent to libgit2's `git_graph_ahead_behind`.
 *
 * This extends the existing aheadBehind to work with ref names directly.
 *
 * @param {object} args
 * @param {FsClient} args.fs - a file system client
 * @param {string} [args.dir] - The working tree directory path
 * @param {string} [args.gitdir=join(dir, '.git')] - The git directory path
 * @param {string} args.local - Local ref
 * @param {string} args.upstream - Upstream ref
 * @param {object} [args.cache] - a cache object
 * @returns {Promise<{ahead: number, behind: number}>}
 */
export async function graphAheadBehind({
  fs: _fs,
  dir,
  gitdir = join(dir, '.git'),
  local,
  upstream,
  cache = {},
}) {
  try {
    assertParameter('fs', _fs)
    assertParameter('gitdir', gitdir)
    assertParameter('local', local)
    assertParameter('upstream', upstream)
    const fs = new FileSystem(_fs)
    const updatedGitdir = await discoverGitdir({ fsp: fs, dotgit: gitdir })

    const localOid = await GitRefManager.resolve({ fs, gitdir: updatedGitdir, ref: local })
    const upstreamOid = await GitRefManager.resolve({ fs, gitdir: updatedGitdir, ref: upstream })

    if (localOid === upstreamOid) return { ahead: 0, behind: 0 }

    const bases = await _findMergeBase({ fs, cache, gitdir: updatedGitdir, oids: [localOid, upstreamOid] })
    const base = bases.length > 0 ? bases[0] : null

    const ahead = await countCommits(fs, cache, updatedGitdir, localOid, base)
    const behind = await countCommits(fs, cache, updatedGitdir, upstreamOid, base)

    return { ahead, behind }
  } catch (err) {
    err.caller = 'git.graphAheadBehind'
    throw err
  }
}

/**
 * Check if a commit is a descendant of another.
 * Equivalent to libgit2's `git_graph_descendant_of`.
 *
 * @param {object} args
 * @param {FsClient} args.fs - a file system client
 * @param {string} [args.dir] - The working tree directory path
 * @param {string} [args.gitdir=join(dir, '.git')] - The git directory path
 * @param {string} args.oid - The potential descendant
 * @param {string} args.ancestor - The potential ancestor
 * @param {object} [args.cache] - a cache object
 * @returns {Promise<boolean>}
 */
export async function graphDescendantOf({
  fs: _fs,
  dir,
  gitdir = join(dir, '.git'),
  oid,
  ancestor,
  cache = {},
}) {
  try {
    assertParameter('fs', _fs)
    assertParameter('gitdir', gitdir)
    assertParameter('oid', oid)
    assertParameter('ancestor', ancestor)
    const fs = new FileSystem(_fs)
    const updatedGitdir = await discoverGitdir({ fsp: fs, dotgit: gitdir })

    if (oid === ancestor) return false

    // BFS from oid towards ancestor
    const visited = new Set()
    const queue = [oid]

    while (queue.length > 0) {
      const current = queue.shift()
      if (current === ancestor) return true
      if (visited.has(current)) continue
      visited.add(current)

      try {
        const { type, object } = await _readObject({ fs, cache, gitdir: updatedGitdir, oid: current })
        if (type !== 'commit') continue
        const commit = GitCommit.from(object).parse()
        if (commit.parent) {
          for (const p of commit.parent) {
            if (!visited.has(p)) queue.push(p)
          }
        }
      } catch (e) {
        // shallow boundary or missing object
      }
    }

    return false
  } catch (err) {
    err.caller = 'git.graphDescendantOf'
    throw err
  }
}

// ---- helpers ----

async function countCommits(fs, cache, gitdir, fromOid, untilOid) {
  if (!untilOid) return 0
  if (fromOid === untilOid) return 0

  let count = 0
  const visited = new Set()
  const queue = [fromOid]

  while (queue.length > 0) {
    const current = queue.shift()
    if (current === untilOid) continue
    if (visited.has(current)) continue
    visited.add(current)
    count++

    try {
      const { type, object } = await _readObject({ fs, cache, gitdir, oid: current })
      if (type !== 'commit') continue
      const commit = GitCommit.from(object).parse()
      if (commit.parent) {
        for (const p of commit.parent) {
          if (!visited.has(p) && p !== untilOid) queue.push(p)
        }
      }
    } catch (e) {
      // missing object
    }
  }

  return count
}
