// @ts-check
import '../typedefs.js'

import { GitIndexManager } from '../managers/GitIndexManager.js'
import { GitRefManager } from '../managers/GitRefManager.js'
import { GitCommit } from '../models/GitCommit.js'
import { FileSystem } from '../models/FileSystem.js'
import { _readObject } from '../storage/readObject.js'
import { assertParameter } from '../utils/assertParameter.js'
import { discoverGitdir } from '../utils/discoverGitdir.js'
import { generateHunks } from '../utils/diff.js'
import { join } from '../utils/join.js'
import { shasum } from '../utils/shasum.js'

/**
 * Diff a tree (commit ref) against the index (staging area).
 * Shows what's staged for the next commit compared to a tree.
 * Equivalent to libgit2's `git_diff_tree_to_index`.
 *
 * @param {object} args
 * @param {FsClient} args.fs - a file system client
 * @param {string} [args.dir] - The working tree directory path
 * @param {string} [args.gitdir=join(dir, '.git')] - The git directory path
 * @param {string} [args.ref='HEAD'] - Tree ref to compare against
 * @param {object} [args.cache] - a cache object
 * @returns {Promise<Array<{path: string, status: string, headOid: string|null, indexOid: string|null}>>}
 */
export async function diffTreeToIndex({
  fs: _fs,
  dir,
  gitdir = join(dir, '.git'),
  ref = 'HEAD',
  cache = {},
}) {
  try {
    assertParameter('fs', _fs)
    assertParameter('gitdir', gitdir)
    const fs = new FileSystem(_fs)
    const updatedGitdir = await discoverGitdir({ fsp: fs, dotgit: gitdir })

    // Get tree entries from ref
    const treeEntries = new Map()
    try {
      const headOid = await GitRefManager.resolve({ fs, gitdir: updatedGitdir, ref })
      const { object: commitBuf } = await _readObject({ fs, cache, gitdir: updatedGitdir, oid: headOid })
      const commit = GitCommit.from(commitBuf).parse()
      await flattenTreeToMap(fs, cache, updatedGitdir, commit.tree, '', treeEntries)
    } catch (e) {
      // Empty repo / unborn HEAD — tree is empty
    }

    // Get index entries
    const indexEntries = new Map()
    await GitIndexManager.acquire(
      { fs, gitdir: updatedGitdir, cache, allowUnmerged: true },
      async function(index) {
        for (const entry of index.entries) {
          if (entry.flags && entry.flags.stage !== 0) continue // skip conflict entries
          indexEntries.set(entry.path, entry.oid)
        }
      }
    )

    // Compare
    const changes = []
    const allPaths = new Set([...treeEntries.keys(), ...indexEntries.keys()])

    for (const path of [...allPaths].sort()) {
      const headOid = treeEntries.get(path) || null
      const indexOid = indexEntries.get(path) || null

      if (headOid && !indexOid) {
        changes.push({ path, status: 'deleted', headOid, indexOid })
      } else if (!headOid && indexOid) {
        changes.push({ path, status: 'added', headOid, indexOid })
      } else if (headOid !== indexOid) {
        changes.push({ path, status: 'modified', headOid, indexOid })
      }
    }

    return changes
  } catch (err) {
    err.caller = 'git.diffTreeToIndex'
    throw err
  }
}

/**
 * Diff two index states (index-to-index comparison).
 * Useful for comparing the index before and after operations.
 *
 * @param {object} args
 * @param {FsClient} args.fs - a file system client
 * @param {string} [args.dir] - The working tree directory path
 * @param {string} [args.gitdir=join(dir, '.git')] - The git directory path
 * @param {string} args.oldRef - First tree ref
 * @param {string} args.newRef - Second tree ref
 * @param {object} [args.cache] - a cache object
 * @returns {Promise<Array<{path: string, status: string, oldOid: string|null, newOid: string|null}>>}
 */
export async function diffIndexToIndex({
  fs: _fs,
  dir,
  gitdir = join(dir, '.git'),
  oldRef,
  newRef,
  cache = {},
}) {
  try {
    assertParameter('fs', _fs)
    assertParameter('gitdir', gitdir)
    assertParameter('oldRef', oldRef)
    assertParameter('newRef', newRef)
    const fs = new FileSystem(_fs)
    const updatedGitdir = await discoverGitdir({ fsp: fs, dotgit: gitdir })

    const oldEntries = new Map()
    const newEntries = new Map()

    await resolveTreeToMap(fs, cache, updatedGitdir, oldRef, oldEntries)
    await resolveTreeToMap(fs, cache, updatedGitdir, newRef, newEntries)

    const changes = []
    const allPaths = new Set([...oldEntries.keys(), ...newEntries.keys()])

    for (const path of [...allPaths].sort()) {
      const oldOid = oldEntries.get(path) || null
      const newOid = newEntries.get(path) || null

      if (oldOid && !newOid) {
        changes.push({ path, status: 'deleted', oldOid, newOid })
      } else if (!oldOid && newOid) {
        changes.push({ path, status: 'added', oldOid, newOid })
      } else if (oldOid !== newOid) {
        changes.push({ path, status: 'modified', oldOid, newOid })
      }
    }

    return changes
  } catch (err) {
    err.caller = 'git.diffIndexToIndex'
    throw err
  }
}

/**
 * Diff two blobs (raw content comparison).
 * Equivalent to libgit2's `git_diff_blobs`.
 *
 * @param {object} args
 * @param {FsClient} args.fs - a file system client
 * @param {string} [args.dir] - The working tree directory path
 * @param {string} [args.gitdir=join(dir, '.git')] - The git directory path
 * @param {string} args.oldOid - Old blob OID
 * @param {string} args.newOid - New blob OID
 * @param {number} [args.contextLines=3] - Context lines around changes
 * @param {object} [args.cache] - a cache object
 * @returns {Promise<{hunks: Array, oldContent: string, newContent: string}>}
 */
export async function diffBlobs({
  fs: _fs,
  dir,
  gitdir = join(dir, '.git'),
  oldOid,
  newOid,
  contextLines = 3,
  cache = {},
}) {
  try {
    assertParameter('fs', _fs)
    assertParameter('gitdir', gitdir)
    assertParameter('oldOid', oldOid)
    assertParameter('newOid', newOid)
    const fs = new FileSystem(_fs)
    const updatedGitdir = await discoverGitdir({ fsp: fs, dotgit: gitdir })

    const oldContent = await readBlobContent(fs, cache, updatedGitdir, oldOid)
    const newContent = await readBlobContent(fs, cache, updatedGitdir, newOid)

    const hunks = generateHunks(oldContent, newContent, contextLines)
    return { hunks, oldContent, newContent }
  } catch (err) {
    err.caller = 'git.diffBlobs'
    throw err
  }
}

/**
 * Compute a patch ID for a diff (useful for finding equivalent patches).
 * Equivalent to libgit2's `git_diff_patchid`.
 *
 * The patch ID is a hash of the diff content, ignoring whitespace
 * and line numbers, so equivalent patches produce the same ID.
 *
 * @param {object} args
 * @param {FsClient} args.fs - a file system client
 * @param {string} [args.dir] - The working tree directory path
 * @param {string} [args.gitdir=join(dir, '.git')] - The git directory path
 * @param {string} args.oldRef - Old ref
 * @param {string} args.newRef - New ref
 * @param {object} [args.cache] - a cache object
 * @returns {Promise<string>} The patch ID (hex SHA-1)
 */
export async function diffPatchId({
  fs: _fs,
  dir,
  gitdir = join(dir, '.git'),
  oldRef,
  newRef,
  cache = {},
}) {
  try {
    assertParameter('fs', _fs)
    assertParameter('gitdir', gitdir)
    assertParameter('oldRef', oldRef)
    assertParameter('newRef', newRef)
    const fs = new FileSystem(_fs)
    const updatedGitdir = await discoverGitdir({ fsp: fs, dotgit: gitdir })

    const oldEntries = new Map()
    const newEntries = new Map()
    await resolveTreeToMap(fs, cache, updatedGitdir, oldRef, oldEntries)
    await resolveTreeToMap(fs, cache, updatedGitdir, newRef, newEntries)

    // Build a canonical diff representation for hashing
    const allPaths = new Set([...oldEntries.keys(), ...newEntries.keys()])
    let patchContent = ''

    for (const path of [...allPaths].sort()) {
      const oldOid = oldEntries.get(path)
      const newOid = newEntries.get(path)
      if (oldOid === newOid) continue

      patchContent += `diff ${path}\n`
      if (oldOid) patchContent += `old ${oldOid}\n`
      if (newOid) patchContent += `new ${newOid}\n`

      // Include content diff for more precise patch ID
      const oldContent = oldOid ? await readBlobContent(fs, cache, updatedGitdir, oldOid) : ''
      const newContent = newOid ? await readBlobContent(fs, cache, updatedGitdir, newOid) : ''
      const hunks = generateHunks(oldContent, newContent, 0)
      for (const hunk of hunks) {
        for (const line of hunk.lines) {
          // Strip whitespace for canonical comparison
          patchContent += line.replace(/\s+/g, ' ').trim() + '\n'
        }
      }
    }

    return shasum(Buffer.from(patchContent))
  } catch (err) {
    err.caller = 'git.diffPatchId'
    throw err
  }
}

// ---- helpers ----

async function readBlobContent(fs, cache, gitdir, oid) {
  const { object } = await _readObject({ fs, cache, gitdir, oid })
  return object.toString('utf8')
}

async function flattenTreeToMap(fs, cache, gitdir, treeOid, prefix, map) {
  const { object: treeBuf } = await _readObject({ fs, cache, gitdir, oid: treeOid })
  const entries = parseTreeEntries(treeBuf)
  for (const entry of entries) {
    const fullPath = prefix ? `${prefix}/${entry.path}` : entry.path
    if (entry.mode.startsWith('40') || entry.mode === '40000') {
      await flattenTreeToMap(fs, cache, gitdir, entry.oid, fullPath, map)
    } else if (entry.mode !== '160000') { // skip submodules
      map.set(fullPath, entry.oid)
    }
  }
}

function parseTreeEntries(buffer) {
  const entries = []
  let i = 0
  while (i < buffer.length) {
    const spaceIdx = buffer.indexOf(0x20, i)
    if (spaceIdx === -1) break
    const mode = buffer.slice(i, spaceIdx).toString('utf8')
    const nullIdx = buffer.indexOf(0x00, spaceIdx + 1)
    if (nullIdx === -1) break
    const path = buffer.slice(spaceIdx + 1, nullIdx).toString('utf8')
    const oid = buffer.slice(nullIdx + 1, nullIdx + 21).toString('hex')
    entries.push({ mode, path, oid })
    i = nullIdx + 21
  }
  return entries
}

async function resolveTreeToMap(fs, cache, gitdir, ref, map) {
  const oid = await GitRefManager.resolve({ fs, gitdir, ref })
  const { type, object } = await _readObject({ fs, cache, gitdir, oid })
  let treeOid
  if (type === 'commit') {
    const commit = GitCommit.from(object).parse()
    treeOid = commit.tree
  } else if (type === 'tree') {
    treeOid = oid
  } else {
    throw new Error(`Expected commit or tree, got ${type}`)
  }
  await flattenTreeToMap(fs, cache, gitdir, treeOid, '', map)
}
