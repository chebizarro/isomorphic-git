import '../typedefs.js'
import { _checkout } from '../commands/checkout.js'
import { GitIndexManager } from '../managers/GitIndexManager.js'
import { GitRefManager } from '../managers/GitRefManager.js'
import { FileSystem } from '../models/FileSystem.js'
import { _readObject as readObject } from '../storage/readObject.js'
import { resetIndexToTree } from '../utils/resetIndexToTree.js'
import { assertParameter } from '../utils/assertParameter.js'
import { discoverGitdir } from '../utils/discoverGitdir.js'
import { join } from '../utils/join.js'
import { resolveCommit } from '../utils/resolveCommit.js'

/**
 * Reset the repository to a specified commit.
 *
 * Supports three modes matching libgit2/git semantics:
 * - `'soft'`: Move HEAD (and current branch) to the target commit. Index and workdir unchanged.
 * - `'mixed'` (default): Move HEAD and reset the index to match the target commit. Workdir unchanged.
 * - `'hard'`: Move HEAD, reset the index, AND reset the working directory to match the target commit.
 *
 * @param {object} args
 * @param {FsClient} args.fs - a file system client
 * @param {string} [args.dir] - The working tree directory path
 * @param {string} [args.gitdir=join(dir,'.git')] - The git directory path
 * @param {string} [args.ref='HEAD'] - The ref or OID to reset to
 * @param {'soft'|'mixed'|'hard'} [args.mode='mixed'] - The reset mode
 * @param {object} [args.cache] - a cache object
 * @returns {Promise<void>}
 *
 * @example
 * // Soft reset (move HEAD only)
 * await git.reset({ fs, dir, ref: 'HEAD~1', mode: 'soft' })
 *
 * // Mixed reset (move HEAD + reset index)
 * await git.reset({ fs, dir, ref: 'HEAD~1', mode: 'mixed' })
 *
 * // Hard reset (move HEAD + reset index + reset workdir)
 * await git.reset({ fs, dir, ref: 'HEAD~1', mode: 'hard' })
 */
export async function reset({
  fs: _fs,
  dir,
  gitdir = join(dir, '.git'),
  ref = 'HEAD',
  mode = 'mixed',
  cache = {},
}) {
  try {
    assertParameter('fs', _fs)
    assertParameter('gitdir', gitdir)

    if (!['soft', 'mixed', 'hard'].includes(mode)) {
      throw new Error(
        `Invalid reset mode '${mode}'. Must be 'soft', 'mixed', or 'hard'.`
      )
    }

    const fs = new FileSystem(_fs)
    gitdir = await discoverGitdir({ fsp: fs, dotgit: gitdir })

    // Resolve the target OID
    const { oid: targetOid } = await resolveCommit({
      fs,
      cache,
      gitdir,
      oid: await GitRefManager.resolve({ fs, gitdir, ref }),
    })

    // Step 1: Move HEAD (and current branch) to the target commit
    // Read current HEAD to determine if we're on a branch
    const headContent = await fs.read(join(gitdir, 'HEAD'), 'utf8')
    const symrefMatch = headContent.trim().match(/^ref: (.+)$/)

    if (symrefMatch) {
      // HEAD is a symbolic ref — update the branch it points to
      const branchRef = symrefMatch[1]
      await GitRefManager.writeRef({
        fs,
        gitdir,
        ref: branchRef,
        value: targetOid,
      })
    } else {
      // Detached HEAD — update HEAD directly
      await GitRefManager.writeRef({
        fs,
        gitdir,
        ref: 'HEAD',
        value: targetOid,
      })
    }

    if (mode === 'soft') {
      return
    }

    // Step 2 (mixed + hard): Reset the index to match the target commit's tree
    const { object: commitBuffer } = await readObject({
      fs,
      cache,
      gitdir,
      oid: targetOid,
    })
    const commitContent = Buffer.from(commitBuffer).toString('utf8')
    const treeMatch = commitContent.match(/^tree ([0-9a-f]{40})/m)
    if (!treeMatch) {
      throw new Error(`Could not find tree in commit ${targetOid}`)
    }
    const treeOid = treeMatch[1]

    // Walk the tree and rebuild the index
    await resetIndexToTree({ fs, cache, gitdir, treeOid })

    if (mode === 'mixed') {
      return
    }

    // Step 3 (hard): Reset working directory
    if (!dir) {
      throw new Error("Cannot perform hard reset without 'dir' parameter")
    }

    // Collect the set of files that should exist (from the target tree)
    const targetFiles = new Set()
    await GitIndexManager.acquire(
      { fs, gitdir, cache },
      async function(index) {
        for (const entry of index.entries) {
          targetFiles.add(typeof entry === 'string' ? entry : entry.path || entry)
        }
      }
    )

    // Remove workdir files that are NOT in the target tree
    await removeExtraFiles({ fs, dir, targetFiles, prefix: '' })

    // Checkout the target tree into the workdir
    await _checkout({
      fs,
      cache,
      onProgress: undefined,
      dir,
      gitdir,
      ref: targetOid,
      force: true,
      noCheckout: false,
      noUpdateHead: true, // We already moved HEAD
      dryRun: false,
      track: false,
    })
  } catch (err) {
    err.caller = 'git.reset'
    throw err
  }
}

/**
 * Recursively remove workdir files not in the target set
 */
async function removeExtraFiles({ fs, dir, targetFiles, prefix }) {
  const entries = await fs.readdir(join(dir, prefix))
  for (const entry of entries) {
    if (entry === '.git') continue
    const filepath = prefix ? `${prefix}/${entry}` : entry
    const fullpath = join(dir, filepath)
    const stat = await fs.lstat(fullpath)
    if (stat.isDirectory()) {
      await removeExtraFiles({ fs, dir, targetFiles, prefix: filepath })
      // Remove empty directories
      const remaining = await fs.readdir(fullpath)
      if (remaining.length === 0) {
        await fs.rmdir(fullpath)
      }
    } else {
      if (!targetFiles.has(filepath)) {
        await fs.rm(fullpath)
      }
    }
  }
}

