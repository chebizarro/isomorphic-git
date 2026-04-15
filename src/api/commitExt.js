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
 * Get the nth ancestor of a commit (following first parents).
 * Equivalent to libgit2's `git_commit_nth_gen_ancestor`.
 *
 * @param {object} args
 * @param {FsClient} args.fs - a file system client
 * @param {string} [args.dir] - The working tree directory path
 * @param {string} [args.gitdir=join(dir, '.git')] - The git directory path
 * @param {string} args.oid - The starting commit OID
 * @param {number} args.n - The generation number (0 = self, 1 = parent, etc.)
 * @param {object} [args.cache] - a cache object
 * @returns {Promise<string>} The OID of the nth ancestor
 */
export async function commitNthAncestor({
  fs: _fs,
  dir,
  gitdir = join(dir, '.git'),
  oid,
  n,
  cache = {},
}) {
  try {
    assertParameter('fs', _fs)
    assertParameter('gitdir', gitdir)
    assertParameter('oid', oid)
    assertParameter('n', n)
    const fs = new FileSystem(_fs)
    const updatedGitdir = await discoverGitdir({ fsp: fs, dotgit: gitdir })

    let current = oid
    for (let i = 0; i < n; i++) {
      const { type, object } = await _readObject({ fs, cache, gitdir: updatedGitdir, oid: current })
      if (type !== 'commit') {
        throw new Error(`Object ${current} is not a commit`)
      }
      const commit = GitCommit.from(object).parse()
      if (!commit.parent || commit.parent.length === 0) {
        throw new Error(`Commit ${current} has no parent (reached root at generation ${i})`)
      }
      current = commit.parent[0]
    }
    return current
  } catch (err) {
    err.caller = 'git.commitNthAncestor'
    throw err
  }
}

/**
 * Get the nth parent of a commit.
 * Equivalent to libgit2's `git_commit_parent_id`.
 *
 * @param {object} args
 * @param {FsClient} args.fs - a file system client
 * @param {string} [args.dir] - The working tree directory path
 * @param {string} [args.gitdir=join(dir, '.git')] - The git directory path
 * @param {string} args.oid - The commit OID
 * @param {number} [args.n=0] - The parent index (0 = first parent)
 * @param {object} [args.cache] - a cache object
 * @returns {Promise<string|null>} The parent OID or null if no such parent
 */
export async function commitParent({
  fs: _fs,
  dir,
  gitdir = join(dir, '.git'),
  oid,
  n = 0,
  cache = {},
}) {
  try {
    assertParameter('fs', _fs)
    assertParameter('gitdir', gitdir)
    assertParameter('oid', oid)
    const fs = new FileSystem(_fs)
    const updatedGitdir = await discoverGitdir({ fsp: fs, dotgit: gitdir })

    const { type, object } = await _readObject({ fs, cache, gitdir: updatedGitdir, oid })
    if (type !== 'commit') {
      throw new Error(`Object ${oid} is not a commit`)
    }
    const commit = GitCommit.from(object).parse()
    if (!commit.parent || n >= commit.parent.length) {
      return null
    }
    return commit.parent[n]
  } catch (err) {
    err.caller = 'git.commitParent'
    throw err
  }
}

/**
 * Extract all header fields from a commit object.
 * Equivalent to libgit2's `git_commit_header_field`.
 *
 * Returns the parsed commit including tree, parents, author, committer,
 * gpgsig, and any extra headers.
 *
 * @param {object} args
 * @param {FsClient} args.fs - a file system client
 * @param {string} [args.dir] - The working tree directory path
 * @param {string} [args.gitdir=join(dir, '.git')] - The git directory path
 * @param {string} args.oid - The commit OID
 * @param {string} [args.field] - Optional specific header field to return
 * @param {object} [args.cache] - a cache object
 * @returns {Promise<object|string|null>} The full parsed commit, or the specific field value
 */
export async function commitHeaderField({
  fs: _fs,
  dir,
  gitdir = join(dir, '.git'),
  oid,
  field,
  cache = {},
}) {
  try {
    assertParameter('fs', _fs)
    assertParameter('gitdir', gitdir)
    assertParameter('oid', oid)
    const fs = new FileSystem(_fs)
    const updatedGitdir = await discoverGitdir({ fsp: fs, dotgit: gitdir })

    const { type, object } = await _readObject({ fs, cache, gitdir: updatedGitdir, oid })
    if (type !== 'commit') {
      throw new Error(`Object ${oid} is not a commit`)
    }

    const commitText = object.toString('utf8')

    if (field) {
      // Extract specific header field
      const headerEnd = commitText.indexOf('\n\n')
      const headerSection = headerEnd !== -1 ? commitText.slice(0, headerEnd) : commitText
      const lines = headerSection.split('\n')
      const values = []
      let collecting = false
      for (const line of lines) {
        if (line.startsWith(field + ' ')) {
          values.push(line.slice(field.length + 1))
          collecting = true
        } else if (collecting && line.startsWith(' ')) {
          // Continuation line (for gpgsig etc.)
          values[values.length - 1] += '\n' + line.slice(1)
        } else {
          collecting = false
        }
      }
      if (values.length === 0) return null
      return values.length === 1 ? values[0] : values
    }

    // Return full parsed commit
    const commit = GitCommit.from(object)
    return commit.parse()
  } catch (err) {
    err.caller = 'git.commitHeaderField'
    throw err
  }
}
