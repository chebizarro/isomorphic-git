// @ts-check
import '../typedefs.js'

import { _findMergeBase } from '../commands/findMergeBase.js'
import { GitRefManager } from '../managers/GitRefManager.js'
import { FileSystem } from '../models/FileSystem.js'
import { assertParameter } from '../utils/assertParameter.js'
import { discoverGitdir } from '../utils/discoverGitdir.js'
import { join } from '../utils/join.js'

/**
 * Merge analysis result flags matching libgit2's git_merge_analysis_t
 */
export const MERGE_ANALYSIS = Object.freeze({
  /** No merge possible (e.g., empty repo) */
  NONE: 0,
  /** A normal merge is possible */
  NORMAL: 1 << 0,
  /** Already up-to-date, nothing to do */
  UP_TO_DATE: 1 << 1,
  /** Can be fast-forwarded (theirs is descendant of ours) */
  FASTFORWARD: 1 << 2,
  /** HEAD is unborn — no commits yet */
  UNBORN: 1 << 3,
})

/**
 * Merge preference flags matching libgit2's git_merge_preference_t
 */
export const MERGE_PREFERENCE = Object.freeze({
  NONE: 0,
  NO_FASTFORWARD: 1 << 0,
  FASTFORWARD_ONLY: 1 << 1,
})

/**
 * Analyze the merge possibilities between the current branch and a target ref.
 * Equivalent to libgit2's `git_merge_analysis`.
 *
 * Returns both the analysis result (what kind of merge is possible) and the
 * merge preference (from config).
 *
 * @param {object} args
 * @param {FsClient} args.fs - a file system client
 * @param {string} [args.dir] - The working tree directory path
 * @param {string} [args.gitdir=join(dir, '.git')] - The git directory path
 * @param {string} [args.ours] - Our ref (default: current branch/HEAD)
 * @param {string} args.theirs - Their ref to merge in
 * @param {object} [args.cache] - a cache object
 * @returns {Promise<{analysis: number, preference: number, mergeBase: string|null}>}
 */
export async function mergeAnalysis({
  fs: _fs,
  dir,
  gitdir = join(dir, '.git'),
  ours,
  theirs,
  cache = {},
}) {
  try {
    assertParameter('fs', _fs)
    assertParameter('gitdir', gitdir)
    assertParameter('theirs', theirs)
    const fs = new FileSystem(_fs)
    const updatedGitdir = await discoverGitdir({ fsp: fs, dotgit: gitdir })

    // Resolve our ref
    let ourOid
    try {
      if (ours) {
        ourOid = await GitRefManager.resolve({ fs, gitdir: updatedGitdir, ref: ours })
      } else {
        ourOid = await GitRefManager.resolve({ fs, gitdir: updatedGitdir, ref: 'HEAD' })
      }
    } catch (e) {
      // HEAD is unborn
      return {
        analysis: MERGE_ANALYSIS.UNBORN,
        preference: MERGE_PREFERENCE.NONE,
        mergeBase: null,
      }
    }

    // Resolve their ref
    const theirOid = await GitRefManager.resolve({ fs, gitdir: updatedGitdir, ref: theirs })

    // Same commit? Already up to date.
    if (ourOid === theirOid) {
      return {
        analysis: MERGE_ANALYSIS.UP_TO_DATE,
        preference: MERGE_PREFERENCE.NONE,
        mergeBase: ourOid,
      }
    }

    // Find merge base
    const bases = await _findMergeBase({ fs, cache, gitdir: updatedGitdir, oids: [ourOid, theirOid] })
    const mergeBase = bases.length > 0 ? bases[0] : null

    let analysis = MERGE_ANALYSIS.NONE

    if (mergeBase === ourOid) {
      // Our commit is ancestor of theirs — fast forward possible
      analysis = MERGE_ANALYSIS.FASTFORWARD | MERGE_ANALYSIS.NORMAL
    } else if (mergeBase === theirOid) {
      // Their commit is ancestor of ours — already up to date
      analysis = MERGE_ANALYSIS.UP_TO_DATE
    } else {
      // Normal merge needed
      analysis = MERGE_ANALYSIS.NORMAL
    }

    // Check merge config for preference
    let preference = MERGE_PREFERENCE.NONE
    try {
      const headContent = await fs.read(join(updatedGitdir, 'HEAD'), { encoding: 'utf8' })
      if (headContent && headContent.trim().startsWith('ref:')) {
        const branchRef = headContent.trim().slice(4).trim()
        const branchName = branchRef.replace('refs/heads/', '')
        // Check branch.<name>.mergeoptions for --ff-only or --no-ff
        const { GitConfigManager } = await import('../managers/GitConfigManager.js')
        const config = await GitConfigManager.get({ fs, gitdir: updatedGitdir })
        const mergeOpts = await config.get(`branch.${branchName}.mergeoptions`)
        if (mergeOpts) {
          if (mergeOpts.includes('--ff-only')) {
            preference = MERGE_PREFERENCE.FASTFORWARD_ONLY
          } else if (mergeOpts.includes('--no-ff')) {
            preference = MERGE_PREFERENCE.NO_FASTFORWARD
          }
        }
      }
    } catch (e) {
      // config read failure — use default
    }

    return { analysis, preference, mergeBase }
  } catch (err) {
    err.caller = 'git.mergeAnalysis'
    throw err
  }
}
