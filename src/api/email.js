// @ts-check
import '../typedefs.js'

import { GitCommit } from '../models/GitCommit.js'
import { GitRefManager } from '../managers/GitRefManager.js'
import { FileSystem } from '../models/FileSystem.js'
import { _readObject } from '../storage/readObject.js'
import { assertParameter } from '../utils/assertParameter.js'
import { discoverGitdir } from '../utils/discoverGitdir.js'
import { generateHunks } from '../utils/diff.js'
import { join } from '../utils/join.js'

/**
 * Generate an mbox-formatted email patch from a commit.
 * Equivalent to libgit2's `git_email_create_from_commit`.
 *
 * Produces output compatible with `git am`.
 *
 * @param {object} args
 * @param {FsClient} args.fs - a file system client
 * @param {string} [args.dir] - The working tree directory path
 * @param {string} [args.gitdir=join(dir, '.git')] - The git directory path
 * @param {string} args.oid - The commit OID
 * @param {number} [args.patchNumber=1] - Patch number in the series
 * @param {number} [args.totalPatches=1] - Total patches in the series
 * @param {object} [args.cache] - a cache object
 * @returns {Promise<string>} The mbox-formatted patch
 */
export async function emailCreateFromCommit({
  fs: _fs,
  dir,
  gitdir = join(dir, '.git'),
  oid,
  patchNumber = 1,
  totalPatches = 1,
  cache = {},
}) {
  try {
    assertParameter('fs', _fs)
    assertParameter('gitdir', gitdir)
    assertParameter('oid', oid)
    const fs = new FileSystem(_fs)
    const updatedGitdir = await discoverGitdir({ fsp: fs, dotgit: gitdir })

    const { object: commitBuf } = await _readObject({ fs, cache, gitdir: updatedGitdir, oid })
    const commit = GitCommit.from(commitBuf).parse()

    // Generate the diff
    let diffText = ''
    if (commit.parent && commit.parent.length > 0) {
      const parentOid = commit.parent[0]
      const parentEntries = new Map()
      const currentEntries = new Map()

      await flattenCommitTree(fs, cache, updatedGitdir, parentOid, parentEntries)
      await flattenCommitTree(fs, cache, updatedGitdir, oid, currentEntries)

      const allPaths = new Set([...parentEntries.keys(), ...currentEntries.keys()])
      for (const path of [...allPaths].sort()) {
        const oldOid = parentEntries.get(path)
        const newOid = currentEntries.get(path)
        if (oldOid === newOid) continue

        diffText += `diff --git a/${path} b/${path}\n`
        if (!oldOid) {
          diffText += `new file mode 100644\n`
          diffText += `--- /dev/null\n`
          diffText += `+++ b/${path}\n`
        } else if (!newOid) {
          diffText += `deleted file mode 100644\n`
          diffText += `--- a/${path}\n`
          diffText += `+++ /dev/null\n`
        } else {
          diffText += `--- a/${path}\n`
          diffText += `+++ b/${path}\n`
        }

        const oldContent = oldOid ? await readBlobStr(fs, cache, updatedGitdir, oldOid) : ''
        const newContent = newOid ? await readBlobStr(fs, cache, updatedGitdir, newOid) : ''
        const hunks = generateHunks(oldContent, newContent, 3)
        for (const hunk of hunks) {
          diffText += `@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@\n`
          diffText += hunk.lines.join('\n') + '\n'
        }
      }
    }

    // Format as mbox email
    const author = commit.author
    const date = new Date(author.timestamp * 1000)
    const subject = commit.message.split('\n')[0]
    const body = commit.message.split('\n').slice(1).join('\n').trim()

    const patchNum = String(patchNumber).padStart(String(totalPatches).length, '0')

    let mbox = `From ${oid} Mon Sep 17 00:00:00 2001\n`
    mbox += `From: ${author.name} <${author.email}>\n`
    mbox += `Date: ${date.toUTCString()}\n`
    mbox += `Subject: [PATCH ${patchNum}/${totalPatches}] ${subject}\n`
    mbox += `\n`
    if (body) {
      mbox += body + '\n'
    }
    mbox += `---\n`
    mbox += diffText
    mbox += `-- \n`
    mbox += `dimorphic-git\n`

    return mbox
  } catch (err) {
    err.caller = 'git.emailCreateFromCommit'
    throw err
  }
}

// ---- helpers ----

async function flattenCommitTree(fs, cache, gitdir, commitOid, map) {
  const { object: buf } = await _readObject({ fs, cache, gitdir, oid: commitOid })
  const commit = GitCommit.from(buf).parse()
  await flattenTree(fs, cache, gitdir, commit.tree, '', map)
}

async function flattenTree(fs, cache, gitdir, treeOid, prefix, map) {
  const { object: treeBuf } = await _readObject({ fs, cache, gitdir, oid: treeOid })
  let i = 0
  while (i < treeBuf.length) {
    const spaceIdx = treeBuf.indexOf(0x20, i)
    if (spaceIdx === -1) break
    const mode = treeBuf.slice(i, spaceIdx).toString('utf8')
    const nullIdx = treeBuf.indexOf(0x00, spaceIdx + 1)
    if (nullIdx === -1) break
    const path = treeBuf.slice(spaceIdx + 1, nullIdx).toString('utf8')
    const oid = treeBuf.slice(nullIdx + 1, nullIdx + 21).toString('hex')
    i = nullIdx + 21

    const fullPath = prefix ? `${prefix}/${path}` : path
    if (mode.startsWith('40') || mode === '40000') {
      await flattenTree(fs, cache, gitdir, oid, fullPath, map)
    } else if (mode !== '160000') {
      map.set(fullPath, oid)
    }
  }
}

async function readBlobStr(fs, cache, gitdir, oid) {
  const { object } = await _readObject({ fs, cache, gitdir, oid })
  return object.toString('utf8')
}
