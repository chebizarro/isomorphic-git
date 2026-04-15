import '../typedefs.js'
import { FileSystem } from '../models/FileSystem.js'
import { GitCommit } from '../models/GitCommit.js'
import { GitRefManager } from '../managers/GitRefManager.js'
import { _readObject as readObject } from '../storage/readObject.js'
import { assertParameter } from '../utils/assertParameter.js'
import { discoverGitdir } from '../utils/discoverGitdir.js'
import { join } from '../utils/join.js'
import { myersDiff } from '../utils/diff.js'

/**
 * @typedef {Object} BlameLine
 * @property {string} content - The line content
 * @property {string} oid - The commit OID that last modified this line
 * @property {string} author - Author name
 * @property {string} email - Author email
 * @property {number} timestamp - Author timestamp
 * @property {number} line - 1-based line number in the current file
 * @property {number} originalLine - 1-based line number in the original file at that commit
 * @property {string} filename - The filename at the time of the commit
 */

/**
 * Get blame information for each line in a file.
 *
 * For each line in the file at the given ref, returns the commit that last
 * modified it, along with author and date info.
 *
 * Equivalent to libgit2's `git_blame_file`.
 *
 * @param {object} args
 * @param {FsClient} args.fs - a file system client
 * @param {string} [args.dir] - The working tree directory path
 * @param {string} [args.gitdir=join(dir,'.git')] - The git directory path
 * @param {string} args.ref - The ref to blame (e.g. 'HEAD', 'main')
 * @param {string} args.filepath - Path to the file within the repo
 * @param {object} [args.cache] - a cache object
 * @returns {Promise<BlameLine[]>} Array of blame entries, one per line
 *
 * @example
 * const lines = await git.blame({ fs, dir, ref: 'HEAD', filepath: 'README.md' })
 * for (const line of lines) {
 *   console.log(`${line.oid.slice(0,7)} (${line.author}) ${line.content}`)
 * }
 */
export async function blame({
  fs: _fs,
  dir,
  gitdir = join(dir, '.git'),
  ref,
  filepath,
  cache = {},
}) {
  try {
    assertParameter('fs', _fs)
    assertParameter('gitdir', gitdir)
    assertParameter('ref', ref)
    assertParameter('filepath', filepath)

    const fs = new FileSystem(_fs)
    gitdir = await discoverGitdir({ fsp: fs, dotgit: gitdir })

    // Resolve the ref (supports revparse syntax)
    let oid = await resolveRefSpec({ fs, cache, gitdir, spec: ref })

    // Read the file at the given ref
    const content = await readFileAtCommit({ fs, cache, gitdir, oid, filepath })
    if (content === null) {
      throw new Error(`File '${filepath}' not found at ref '${ref}'`)
    }

    const lines = content.split('\n')
    // Remove trailing empty line from final newline
    if (lines.length > 0 && lines[lines.length - 1] === '') {
      lines.pop()
    }

    // Initialize blame entries - all unattributed
    const blameEntries = lines.map((line, i) => ({
      content: line,
      oid: null,
      author: null,
      email: null,
      timestamp: null,
      line: i + 1,
      originalLine: i + 1,
      filename: filepath,
    }))

    // Track which lines still need attribution
    // Each entry: { currentIdx, content }
    let unblamed = blameEntries.map((e, i) => ({
      idx: i,
      content: e.content,
    }))

    let currentOid = oid
    let currentFilepath = filepath

    // Walk commit history
    const MAX_DEPTH = 1000
    for (let depth = 0; depth < MAX_DEPTH && unblamed.length > 0; depth++) {
      const { type, object } = await readObject({ fs, cache, gitdir, oid: currentOid })
      if (type !== 'commit') break

      const commit = GitCommit.from(object)
      const headers = commit.parseHeaders()

      if (headers.parent.length === 0) {
        // Root commit — attribute all remaining lines
        for (const u of unblamed) {
          blameEntries[u.idx].oid = currentOid
          blameEntries[u.idx].author = headers.author.name
          blameEntries[u.idx].email = headers.author.email
          blameEntries[u.idx].timestamp = headers.author.timestamp
          blameEntries[u.idx].filename = currentFilepath
        }
        unblamed = []
        break
      }

      // Compare with first parent
      const parentOid = headers.parent[0]
      const parentContent = await readFileAtCommit({
        fs, cache, gitdir, oid: parentOid, filepath: currentFilepath,
      })

      if (parentContent === null) {
        // File didn't exist in parent — this commit added it
        for (const u of unblamed) {
          blameEntries[u.idx].oid = currentOid
          blameEntries[u.idx].author = headers.author.name
          blameEntries[u.idx].email = headers.author.email
          blameEntries[u.idx].timestamp = headers.author.timestamp
          blameEntries[u.idx].filename = currentFilepath
        }
        unblamed = []
        break
      }

      const currentLines = unblamed.map(u => u.content)
      const parentLines = parentContent.split('\n')
      if (parentLines.length > 0 && parentLines[parentLines.length - 1] === '') {
        parentLines.pop()
      }

      // Diff parent→current file to find which current lines are new in this commit
      const allCurrentContent = await readFileAtCommit({
        fs, cache, gitdir, oid: currentOid, filepath: currentFilepath,
      })
      const allCurrentLines = allCurrentContent.split('\n')
      if (allCurrentLines.length > 0 && allCurrentLines[allCurrentLines.length - 1] === '') {
        allCurrentLines.pop()
      }

      const edits = myersDiff(parentLines, allCurrentLines)

      // Build a map: currentLineIdx → parentLineIdx (for equal lines)
      // and identify lines that are new in this commit (inserts)
      const currentToParent = new Map()
      const newInThisCommit = new Set()
      let parentIdx = 0
      let currentIdx = 0
      for (const edit of edits) {
        for (const _line of edit.lines) {
          if (edit.type === 'equal') {
            currentToParent.set(currentIdx, parentIdx)
            parentIdx++
            currentIdx++
          } else if (edit.type === 'delete') {
            parentIdx++
          } else {
            // insert
            newInThisCommit.add(currentIdx)
            currentIdx++
          }
        }
      }

      // Attribute newly inserted lines to this commit
      const stillUnblamed = []
      for (const u of unblamed) {
        // Find this line's position in allCurrentLines
        const lineInFile = blameEntries[u.idx].line - 1 // 0-based
        if (newInThisCommit.has(lineInFile)) {
          blameEntries[u.idx].oid = currentOid
          blameEntries[u.idx].author = headers.author.name
          blameEntries[u.idx].email = headers.author.email
          blameEntries[u.idx].timestamp = headers.author.timestamp
          blameEntries[u.idx].filename = currentFilepath
        } else {
          stillUnblamed.push(u)
        }
      }
      unblamed = stillUnblamed

      currentOid = parentOid
    }

    // Any remaining unblamed lines get the oldest commit we reached
    if (unblamed.length > 0) {
      const { object } = await readObject({ fs, cache, gitdir, oid: currentOid })
      const commit = GitCommit.from(object)
      const headers = commit.parseHeaders()
      for (const u of unblamed) {
        blameEntries[u.idx].oid = currentOid
        blameEntries[u.idx].author = headers.author.name
        blameEntries[u.idx].email = headers.author.email
        blameEntries[u.idx].timestamp = headers.author.timestamp
        blameEntries[u.idx].filename = currentFilepath
      }
    }

    return blameEntries
  } catch (err) {
    err.caller = 'git.blame'
    throw err
  }
}

// ─── Private helpers ────────────────────────────────────────────────

/**
 * Resolve a ref spec (supports ~, ^ operators).
 */
async function resolveRefSpec({ fs, cache, gitdir, spec }) {
  // Check for revparse operators
  if (/[~^]/.test(spec)) {
    let refEnd = spec.length
    for (let j = 0; j < spec.length; j++) {
      if (spec[j] === '~' || spec[j] === '^') {
        refEnd = j
        break
      }
    }
    const baseRef = spec.slice(0, refEnd)
    let oid = await GitRefManager.resolve({ fs, gitdir, ref: baseRef })

    let i = refEnd
    while (i < spec.length) {
      const ch = spec[i]
      i++
      let n = 0
      let hasDigit = false
      while (i < spec.length && spec[i] >= '0' && spec[i] <= '9') {
        n = n * 10 + (spec.charCodeAt(i) - 48)
        hasDigit = true
        i++
      }
      if (!hasDigit) n = 1

      if (ch === '~') {
        for (let step = 0; step < n; step++) {
          const { object } = await readObject({ fs, cache, gitdir, oid })
          const commit = GitCommit.from(object)
          const { parent } = commit.parseHeaders()
          if (parent.length === 0) throw new Error(`Cannot resolve '${spec}': no parent`)
          oid = parent[0]
        }
      } else if (ch === '^') {
        if (n === 0) continue
        const { object } = await readObject({ fs, cache, gitdir, oid })
        const commit = GitCommit.from(object)
        const { parent } = commit.parseHeaders()
        if (n - 1 >= parent.length) throw new Error(`Cannot resolve '${spec}': no parent ${n}`)
        oid = parent[n - 1]
      }
    }
    return oid
  }

  return GitRefManager.resolve({ fs, gitdir, ref: spec })
}

/**
 * Read a file's content at a specific commit, or null if not found.
 */
async function readFileAtCommit({ fs, cache, gitdir, oid, filepath }) {
  try {
    // Get commit's tree
    const { type, object } = await readObject({ fs, cache, gitdir, oid })
    if (type !== 'commit') return null

    const content = Buffer.from(object).toString('utf8')
    const match = content.match(/^tree ([0-9a-f]{40})/m)
    if (!match) return null

    const treeOid = match[1]

    // Walk the tree to find the file
    const parts = filepath.split('/')
    let currentTree = treeOid

    for (let i = 0; i < parts.length; i++) {
      const { GitTree } = await import('../models/GitTree.js')
      const { object: treeObj } = await readObject({ fs, cache, gitdir, oid: currentTree })
      const tree = GitTree.from(treeObj)

      const entry = tree.entries().find(e => e.path === parts[i])
      if (!entry) return null

      if (i < parts.length - 1) {
        // Intermediate directory
        currentTree = entry.oid
      } else {
        // Final file — read the blob
        const { object: blob } = await readObject({ fs, cache, gitdir, oid: entry.oid })
        return Buffer.from(blob).toString('utf8')
      }
    }
    return null
  } catch {
    return null
  }
}
