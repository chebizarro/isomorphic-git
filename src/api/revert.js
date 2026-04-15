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
 * Revert a commit (undo its changes).
 *
 * Equivalent to libgit2's `git_revert`.
 * Creates a new commit that undoes the changes made by the given commit.
 *
 * This works by performing a 3-way merge where:
 * - base = the commit being reverted's tree
 * - ours = HEAD's tree
 * - theirs = the commit's parent's tree
 *
 * @param {object} args
 * @param {FsClient} args.fs - a file system client
 * @param {string} [args.dir] - The working tree directory path
 * @param {string} [args.gitdir=join(dir,'.git')] - The git directory path
 * @param {string} args.oid - The SHA-1 of the commit to revert
 * @param {string} [args.message] - Optional message override
 * @param {Object} args.author - The author for the new commit
 * @param {string} args.author.name
 * @param {string} args.author.email
 * @param {number} [args.author.timestamp]
 * @param {number} [args.author.timezoneOffset]
 * @param {Object} [args.committer] - The committer (defaults to author)
 * @param {boolean} [args.noCommit=false] - If true, apply changes to index but don't commit
 * @param {object} [args.cache]
 * @returns {Promise<string>} The OID of the new commit (or merged tree OID if noCommit)
 *
 * @example
 * const newOid = await git.revert({
 *   fs, dir, oid: 'abc123...',
 *   author: { name: 'Test', email: 'test@example.com' }
 * })
 */
export async function revert({
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

    // 1. Read the commit to revert
    const { oid: commitOid } = await resolveCommit({ fs, cache, gitdir, oid })
    const { object: commitBuf } = await _readObject({
      fs, cache, gitdir, oid: commitOid,
    })
    const parsedCommit = GitCommit.from(commitBuf).parse()

    // 2. Get the parent
    if (!parsedCommit.parent || parsedCommit.parent.length === 0) {
      throw new Error(`Cannot revert commit ${commitOid}: it has no parent`)
    }
    const parentOid = parsedCommit.parent[0]

    // 3. For revert, the merge is inverted:
    //    base = commit's tree (we want to undo this)
    //    ours = HEAD's tree (current state)
    //    theirs = parent's tree (the state before the commit)
    const baseTreeOid = parsedCommit.tree
    const headOid = await GitRefManager.resolve({ fs, gitdir, ref: 'HEAD' })
    const ourTreeOid = await getTreeOid({ fs, cache, gitdir, oid: headOid })
    const theirTreeOid = await getTreeOid({ fs, cache, gitdir, oid: parentOid })

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
          theirName: `revert ${commitOid.slice(0, 7)}`,
          dryRun: false,
          abortOnConflict: true,
        })
      }
    )

    if (typeof mergedTreeOid !== 'string') {
      throw mergedTreeOid
    }

    // Update index to match the merged tree
    await resetIndexToTree({ fs, cache, gitdir, treeOid: mergedTreeOid })

    if (noCommit) {
      return mergedTreeOid
    }

    // 5. Create the revert commit
    const commitMessage =
      message || `Revert "${parsedCommit.message.trim()}"\n\nThis reverts commit ${commitOid}.`

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
    err.caller = 'git.revert'
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
