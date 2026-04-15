// @ts-check
import '../typedefs.js'

import { GitTree } from '../models/GitTree.js'
import { FileSystem } from '../models/FileSystem.js'
import { _readObject } from '../storage/readObject.js'
import { _writeObject } from '../storage/writeObject.js'
import { assertParameter } from '../utils/assertParameter.js'
import { discoverGitdir } from '../utils/discoverGitdir.js'
import { join } from '../utils/join.js'

/**
 * Build a tree object from an array of entries.
 * Equivalent to libgit2's tree builder API.
 *
 * @param {object} args
 * @param {FsClient} args.fs - a file system client
 * @param {string} [args.dir] - The working tree directory path
 * @param {string} [args.gitdir=join(dir, '.git')] - The git directory path
 * @param {Array<{mode: string, path: string, oid: string}>} args.entries - Tree entries
 * @param {object} [args.cache] - a cache object
 * @returns {Promise<string>} The OID of the new tree object
 */
export async function buildTree({
  fs: _fs,
  dir,
  gitdir = join(dir, '.git'),
  entries,
  cache = {},
}) {
  try {
    assertParameter('fs', _fs)
    assertParameter('gitdir', gitdir)
    assertParameter('entries', entries)
    const fs = new FileSystem(_fs)
    const updatedGitdir = await discoverGitdir({ fsp: fs, dotgit: gitdir })

    const tree = GitTree.from(
      entries.map(e => ({
        mode: e.mode,
        path: e.path,
        oid: e.oid,
        type: modeToType(e.mode),
      }))
    )

    const oid = await _writeObject({
      fs,
      gitdir: updatedGitdir,
      type: 'tree',
      object: tree.toObject(),
    })

    return oid
  } catch (err) {
    err.caller = 'git.buildTree'
    throw err
  }
}

/**
 * Walk a tree object and return all entries (non-recursive by default).
 * Equivalent to libgit2's tree walker API.
 *
 * @param {object} args
 * @param {FsClient} args.fs - a file system client
 * @param {string} [args.dir] - The working tree directory path
 * @param {string} [args.gitdir=join(dir, '.git')] - The git directory path
 * @param {string} args.oid - The tree OID to walk
 * @param {boolean} [args.recursive=false] - Walk into subtrees
 * @param {object} [args.cache] - a cache object
 * @returns {Promise<Array<{mode: string, path: string, oid: string, type: string}>>}
 */
export async function walkTree({
  fs: _fs,
  dir,
  gitdir = join(dir, '.git'),
  oid,
  recursive = false,
  cache = {},
}) {
  try {
    assertParameter('fs', _fs)
    assertParameter('gitdir', gitdir)
    assertParameter('oid', oid)
    const fs = new FileSystem(_fs)
    const updatedGitdir = await discoverGitdir({ fsp: fs, dotgit: gitdir })

    const results = []
    await _walkTree(fs, cache, updatedGitdir, oid, '', recursive, results)
    return results
  } catch (err) {
    err.caller = 'git.walkTree'
    throw err
  }
}

/**
 * Get a specific entry from a tree by path.
 * Equivalent to libgit2's `git_tree_entry_bypath`.
 *
 * @param {object} args
 * @param {FsClient} args.fs - a file system client
 * @param {string} [args.dir] - The working tree directory path
 * @param {string} [args.gitdir=join(dir, '.git')] - The git directory path
 * @param {string} args.oid - The tree OID
 * @param {string} args.filepath - Path within the tree
 * @param {object} [args.cache] - a cache object
 * @returns {Promise<{mode: string, path: string, oid: string, type: string}|null>}
 */
export async function treeEntryByPath({
  fs: _fs,
  dir,
  gitdir = join(dir, '.git'),
  oid,
  filepath,
  cache = {},
}) {
  try {
    assertParameter('fs', _fs)
    assertParameter('gitdir', gitdir)
    assertParameter('oid', oid)
    assertParameter('filepath', filepath)
    const fs = new FileSystem(_fs)
    const updatedGitdir = await discoverGitdir({ fsp: fs, dotgit: gitdir })

    const parts = filepath.split('/').filter(Boolean)
    let currentTreeOid = oid

    for (let i = 0; i < parts.length; i++) {
      const { object: treeBuf } = await _readObject({
        fs, cache, gitdir: updatedGitdir, oid: currentTreeOid,
      })
      const tree = GitTree.from(treeBuf)
      const entry = tree._entries.find(e => e.path === parts[i])
      if (!entry) return null

      if (i === parts.length - 1) {
        return {
          mode: entry.mode,
          path: entry.path,
          oid: entry.oid,
          type: modeToType(entry.mode),
        }
      }

      // Must be a tree to continue
      if (!entry.mode.startsWith('40') && entry.mode !== '40000') return null
      currentTreeOid = entry.oid
    }

    return null
  } catch (err) {
    err.caller = 'git.treeEntryByPath'
    throw err
  }
}

// ---- helpers ----

async function _walkTree(fs, cache, gitdir, treeOid, prefix, recursive, results) {
  const { object: treeBuf } = await _readObject({ fs, cache, gitdir, oid: treeOid })
  const tree = GitTree.from(treeBuf)

  for (const entry of tree._entries) {
    const fullPath = prefix ? `${prefix}/${entry.path}` : entry.path
    const type = modeToType(entry.mode)

    results.push({
      mode: entry.mode,
      path: fullPath,
      oid: entry.oid,
      type,
    })

    if (recursive && type === 'tree') {
      await _walkTree(fs, cache, gitdir, entry.oid, fullPath, recursive, results)
    }
  }
}

function modeToType(mode) {
  if (mode === '040000' || mode === '40000') return 'tree'
  if (mode === '160000') return 'commit'
  if (mode === '120000') return 'blob' // symlink
  return 'blob'
}
