import '../typedefs.js'
import { GitCommit } from '../models/GitCommit.js'
import { GitRefManager } from '../managers/GitRefManager.js'
import { FileSystem } from '../models/FileSystem.js'
import { _readObject as readObject } from '../storage/readObject.js'
import { assertParameter } from '../utils/assertParameter.js'
import { discoverGitdir } from '../utils/discoverGitdir.js'
import { join } from '../utils/join.js'

/**
 * Describe a commit — find the most recent tag reachable from it.
 *
 * Returns a string like `v1.2.3-14-gabcdef0` where:
 * - `v1.2.3` is the nearest tag
 * - `14` is the number of commits since the tag
 * - `gabcdef0` is the abbreviated OID of the commit (prefixed with `g`)
 *
 * Equivalent to libgit2's `git_describe_commit` / `git_describe_format`.
 *
 * @param {object} args
 * @param {FsClient} args.fs - a file system client
 * @param {string} [args.dir] - The working tree directory path
 * @param {string} [args.gitdir=join(dir,'.git')] - The git directory path
 * @param {string} [args.ref='HEAD'] - The ref to describe
 * @param {boolean} [args.tags=false] - Also consider lightweight tags (not just annotated)
 * @param {string} [args.match] - Only consider tags matching this glob pattern
 * @param {number} [args.abbrev=7] - Number of hex characters for abbreviated OID
 * @param {boolean} [args.long=false] - Always output the long format even when on a tag
 * @param {object} [args.cache] - a cache object
 * @returns {Promise<string>} The description string
 *
 * @example
 * const desc = await git.describe({ fs, dir, ref: 'HEAD' })
 * console.log(desc) // 'v1.2.3-14-gabcdef0'
 */
export async function describe({
  fs: _fs,
  dir,
  gitdir = join(dir, '.git'),
  ref = 'HEAD',
  tags = false,
  match,
  abbrev = 7,
  long = false,
  cache = {},
}) {
  try {
    assertParameter('fs', _fs)
    assertParameter('gitdir', gitdir)

    const fs = new FileSystem(_fs)
    gitdir = await discoverGitdir({ fsp: fs, dotgit: gitdir })

    // Resolve ref to OID
    const oid = await GitRefManager.resolve({ fs, gitdir, ref })

    // Build a map of commit OID → tag name for all reachable tags
    const tagMap = new Map() // commit OID → tag name

    // Get annotated tags
    const tagRefs = await GitRefManager.listRefs({
      fs,
      gitdir,
      filepath: 'refs/tags',
    })

    for (const tagRef of tagRefs) {
      const tagName = tagRef
      if (match && !globMatch(match, tagName)) continue

      const tagOid = await GitRefManager.resolve({
        fs,
        gitdir,
        ref: `refs/tags/${tagRef}`,
      })

      // Peel annotated tags to their commit
      const { type, object } = await readObject({ fs, cache, gitdir, oid: tagOid })
      if (type === 'tag') {
        // Annotated tag — peel to commit
        const content = Buffer.from(object).toString('utf8')
        const objMatch = content.match(/^object ([0-9a-f]{40})/m)
        if (objMatch) {
          tagMap.set(objMatch[1], tagName)
        }
      } else if (type === 'commit' && tags) {
        // Lightweight tag (points directly to commit)
        tagMap.set(tagOid, tagName)
      }
    }

    // Walk commit graph backward from oid, counting depth to nearest tag
    const visited = new Set()
    // BFS queue: [commitOid, depth]
    const queue = [[oid, 0]]
    visited.add(oid)

    while (queue.length > 0) {
      const [currentOid, depth] = queue.shift()

      if (tagMap.has(currentOid)) {
        const tagName = tagMap.get(currentOid)
        if (depth === 0 && !long) {
          return tagName
        }
        return `${tagName}-${depth}-g${oid.slice(0, abbrev)}`
      }

      // Read commit and enqueue parents
      try {
        const { type, object } = await readObject({ fs, cache, gitdir, oid: currentOid })
        if (type !== 'commit') continue
        const commit = GitCommit.from(object)
        const { parent } = commit.parseHeaders()
        for (const parentOid of parent) {
          if (!visited.has(parentOid)) {
            visited.add(parentOid)
            queue.push([parentOid, depth + 1])
          }
        }
      } catch {
        // Missing object — stop this path
      }
    }

    // No tag found — return just the abbreviated OID
    return oid.slice(0, abbrev)
  } catch (err) {
    err.caller = 'git.describe'
    throw err
  }
}

/**
 * Simple glob matching for tag patterns.
 * Supports * as wildcard.
 */
function globMatch(pattern, str) {
  const regex = new RegExp(
    '^' + pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$'
  )
  return regex.test(str)
}
