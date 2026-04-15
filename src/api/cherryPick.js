import '../typedefs.js'
import { _commit } from '../commands/commit.js'
import { GitIndexManager } from '../managers/GitIndexManager.js'
import { GitRefManager } from '../managers/GitRefManager.js'
import { FileSystem } from '../models/FileSystem.js'
import { _readObject } from '../storage/readObject.js'
import { assertParameter } from '../utils/assertParameter.js'
import { discoverGitdir } from '../utils/discoverGitdir.js'
import { join } from '../utils/join.js'
import { mergeTree } from '../utils/mergeTree.js'
import { resetIndexToTree } from '../utils/resetIndexToTree.js'
import { resolveCommit } from '../utils/resolveCommit.js'
import { GitCommit } from '../models/GitCommit.js'

/**
 * Cherry-pick a commit onto the current branch.
 *
 * Equivalent to libgit2's `git_cherrypick`.
 * Applies the changes from the given commit on top of HEAD,
 * creating a new commit with the same message (or a custom one).
 *
 * @param {object} args
 * @param {FsClient} args.fs - a file system client
 * @param {string} [args.dir] - The working tree directory path
 * @param {string} [args.gitdir=join(dir,'.git')] - The git directory path
 * @param {string} args.oid - The SHA-1 of the commit to cherry-pick
 * @param {string} [args.message] - Optional message override
 * @param {Object} args.author - The author for the new commit
 * @param {string} args.author.name
 * @param {string} args.author.email
 * @param {number} [args.author.timestamp]
 * @param {number} [args.author.timezoneOffset]
 * @param {Object} [args.committer] - The committer (defaults to author)
 * @param {boolean} [args.noCommit=false] - If true, apply changes to index but don't commit
 * @param {object} [args.cache]
 * @returns {Promise<string>} The OID of the new commit (or the merged tree OID if noCommit)
 *
 * @example
 * const newOid = await git.cherryPick({
 *   fs, dir, oid: 'abc123...',
 *   author: { name: 'Test', email: 'test@example.com' }
 * })
 */
export async function cherryPick({
  fs: _fs,
  dir,
  gitdir = join(dir, '.git'),
  oid,
  message,
  author,
  committer,
  noCommit = false,
  cache = {},
}) {
  try {
    assertParameter('fs', _fs)
    assertParameter('gitdir', gitdir)
    assertParameter('oid', oid)
    assertParameter('author', author)

    const fs = new FileSystem(_fs)
    gitdir = await discoverGitdir({ fsp: fs, dotgit: gitdir })

    // 1. Read the commit to cherry-pick
    const { oid: commitOid } = await resolveCommit({ fs, cache, gitdir, oid })
    const { object: commitBuf } = await _readObject({
      fs, cache, gitdir, oid: commitOid,
    })
    const parsedCommit = GitCommit.from(commitBuf).parse()

    // 2. Get the parent of the commit (base for 3-way merge)
    if (!parsedCommit.parent || parsedCommit.parent.length === 0) {
      throw new Error(
        `Cannot cherry-pick commit ${commitOid}: it has no parent`
      )
    }
    const parentOid = parsedCommit.parent[0]

    // 3. Get the tree OIDs
    const theirTreeOid = parsedCommit.tree // commit being cherry-picked
    const baseTreeOid = await getTreeOid({ fs, cache, gitdir, oid: parentOid })
    const headOid = await GitRefManager.resolve({ fs, gitdir, ref: 'HEAD' })
    const ourTreeOid = await getTreeOid({ fs, cache, gitdir, oid: headOid })

    // 4. 3-way merge
    let mergedTreeOid
    await GitIndexManager.acquire(
      { fs, gitdir, cache },
      async function(index) {
        mergedTreeOid = await mergeTree({
          fs,
          cache,
          dir,
          gitdir,
          index,
          ourOid: ourTreeOid,
          baseOid: baseTreeOid,
          theirOid: theirTreeOid,
          ourName: 'HEAD',
          theirName: commitOid.slice(0, 7),
          dryRun: false,
          abortOnConflict: true,
        })
      }
    )

    if (typeof mergedTreeOid !== 'string') {
      // mergeTree returns a MergeConflictError if conflicts
      throw mergedTreeOid
    }

    // Update index to match the merged tree
    await resetIndexToTree({ fs, cache, gitdir, treeOid: mergedTreeOid })

    if (noCommit) {
      return mergedTreeOid
    }

    // 5. Create the new commit
    const commitMessage =
      message || parsedCommit.message || `cherry-pick ${commitOid.slice(0, 7)}`

    const newOid = await _commit({
      fs,
      cache,
      gitdir,
      message: commitMessage,
      tree: mergedTreeOid,
      parent: [headOid],
      author,
      committer: committer || author,
    })

    // 6. Update HEAD / current branch
    const headContent = await fs.read(join(gitdir, 'HEAD'), 'utf8')
    const symrefMatch = headContent.trim().match(/^ref: (.+)$/)
    if (symrefMatch) {
      await GitRefManager.writeRef({
        fs, gitdir, ref: symrefMatch[1], value: newOid,
      })
    } else {
      await GitRefManager.writeRef({
        fs, gitdir, ref: 'HEAD', value: newOid,
      })
    }

    return newOid
  } catch (err) {
    err.caller = 'git.cherryPick'
    throw err
  }
}

async function getTreeOid({ fs, cache, gitdir, oid }) {
  const { object } = await _readObject({ fs, cache, gitdir, oid })
  const content = Buffer.from(object).toString('utf8')
  const match = content.match(/^tree ([0-9a-f]{40})/m)
  if (!match) throw new Error(`Could not find tree in commit ${oid}`)
  return match[1]
}
