import '../typedefs.js'
import { FileSystem } from '../models/FileSystem.js'
import { assertParameter } from '../utils/assertParameter.js'
import { discoverGitdir } from '../utils/discoverGitdir.js'
import { join } from '../utils/join.js'

/**
 * Apply a unified diff patch to the working directory.
 *
 * Equivalent to `git apply`. Parses a unified diff and applies
 * the changes to files in the working directory.
 *
 * @param {object} args
 * @param {FsClient} args.fs - a file system client
 * @param {string} args.dir - The working tree directory path
 * @param {string} [args.gitdir=join(dir,'.git')] - The git directory path
 * @param {string} args.patch - The unified diff patch text
 * @param {number} [args.fuzz=0] - Number of context lines that can be wrong
 * @param {object} [args.cache] - a cache object
 * @returns {Promise<Array<{path: string, status: string}>>} Applied file changes
 *
 * @example
 * const results = await git.applyPatch({ fs, dir, patch: patchText })
 * for (const r of results) console.log(r.status, r.path)
 */
export async function applyPatch({
  fs: _fs,
  dir,
  gitdir = join(dir, '.git'),
  patch,
  fuzz = 0,
  cache = {},
}) {
  try {
    assertParameter('fs', _fs)
    assertParameter('dir', dir)
    assertParameter('patch', patch)

    const fs = new FileSystem(_fs)
    await discoverGitdir({ fsp: fs, dotgit: gitdir })

    const fileDiffs = parsePatch(patch)
    const results = []

    for (const diff of fileDiffs) {
      if (diff.binary) {
        results.push({ path: diff.newPath || diff.oldPath, status: 'binary-skipped' })
        continue
      }

      if (diff.deleted) {
        // Delete file
        const filepath = join(dir, diff.oldPath)
        try {
          await fs.rm(filepath)
          results.push({ path: diff.oldPath, status: 'deleted' })
        } catch {
          results.push({ path: diff.oldPath, status: 'delete-failed' })
        }
        continue
      }

      if (diff.created) {
        // Create new file
        const filepath = join(dir, diff.newPath)
        const content = applyHunksToEmpty(diff.hunks)
        // Ensure parent directory exists
        const parentDir = filepath.slice(0, filepath.lastIndexOf('/'))
        await mkdirp(fs, parentDir)
        await fs.write(filepath, content, 'utf8')
        results.push({ path: diff.newPath, status: 'created' })
        continue
      }

      // Modified file — apply hunks
      const filepath = join(dir, diff.oldPath)
      let existing
      try {
        const buf = await fs.read(filepath)
        existing = Buffer.from(buf).toString('utf8')
      } catch {
        results.push({ path: diff.oldPath, status: 'file-not-found' })
        continue
      }

      const result = applyHunks(existing, diff.hunks, fuzz)
      if (result.error) {
        results.push({ path: diff.oldPath, status: `conflict: ${result.error}` })
        continue
      }

      const outPath = diff.newPath !== diff.oldPath ? diff.newPath : diff.oldPath
      const outFilepath = join(dir, outPath)

      if (diff.newPath !== diff.oldPath) {
        // Rename — write to new path and delete old
        const parentDir = outFilepath.slice(0, outFilepath.lastIndexOf('/'))
        await mkdirp(fs, parentDir)
        await fs.write(outFilepath, result.content, 'utf8')
        try { await fs.rm(filepath) } catch { /* ignore */ }
        results.push({ path: `${diff.oldPath} → ${outPath}`, status: 'renamed' })
      } else {
        await fs.write(outFilepath, result.content, 'utf8')
        results.push({ path: outPath, status: 'modified' })
      }
    }

    return results
  } catch (err) {
    err.caller = 'git.applyPatch'
    throw err
  }
}

// ─── Patch Parsing ──────────────────────────────────────────────────

/**
 * Parse a unified diff into individual file diffs.
 */
function parsePatch(patch) {
  const fileDiffs = []
  const lines = patch.split('\n')
  let i = 0

  while (i < lines.length) {
    // Look for diff --git header
    if (!lines[i].startsWith('diff --git ')) {
      i++
      continue
    }

    const diffLine = lines[i]
    const pathMatch = diffLine.match(/^diff --git a\/(.+?) b\/(.+)$/)
    if (!pathMatch) { i++; continue }

    const diff = {
      oldPath: pathMatch[1],
      newPath: pathMatch[2],
      hunks: [],
      binary: false,
      created: false,
      deleted: false,
    }
    i++

    // Parse optional headers (new file mode, deleted file mode, etc.)
    while (i < lines.length && !lines[i].startsWith('diff --git ')) {
      if (lines[i].startsWith('new file mode')) {
        diff.created = true
        i++
      } else if (lines[i].startsWith('deleted file mode')) {
        diff.deleted = true
        i++
      } else if (lines[i].startsWith('Binary files')) {
        diff.binary = true
        i++
        break
      } else if (lines[i].startsWith('--- ')) {
        const oldPath = lines[i].slice(4)
        if (oldPath === '/dev/null') diff.created = true
        i++
      } else if (lines[i].startsWith('+++ ')) {
        const newPath = lines[i].slice(4)
        if (newPath === '/dev/null') diff.deleted = true
        else if (newPath.startsWith('b/')) diff.newPath = newPath.slice(2)
        i++
      } else if (lines[i].startsWith('@@')) {
        // Parse hunk header
        const hunkMatch = lines[i].match(
          /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/
        )
        if (hunkMatch) {
          const hunk = {
            oldStart: parseInt(hunkMatch[1]),
            oldLines: hunkMatch[2] !== undefined ? parseInt(hunkMatch[2]) : 1,
            newStart: parseInt(hunkMatch[3]),
            newLines: hunkMatch[4] !== undefined ? parseInt(hunkMatch[4]) : 1,
            lines: [],
          }
          i++
          // Collect hunk lines
          while (i < lines.length && !lines[i].startsWith('@@') && !lines[i].startsWith('diff --git ')) {
            if (lines[i].startsWith('+') || lines[i].startsWith('-') || lines[i].startsWith(' ')) {
              hunk.lines.push(lines[i])
            } else if (lines[i] === '\\ No newline at end of file') {
              hunk.lines.push(lines[i])
            } else {
              break
            }
            i++
          }
          diff.hunks.push(hunk)
        } else {
          i++
        }
      } else if (lines[i].startsWith('index ') || lines[i].startsWith('similarity ') ||
                 lines[i].startsWith('rename ') || lines[i].startsWith('old mode') ||
                 lines[i].startsWith('new mode') || lines[i].startsWith('copy ')) {
        i++
      } else {
        break
      }
    }

    fileDiffs.push(diff)
  }

  return fileDiffs
}

/**
 * Apply hunks to an empty file (new file creation).
 */
function applyHunksToEmpty(hunks) {
  const lines = []
  for (const hunk of hunks) {
    for (const line of hunk.lines) {
      if (line.startsWith('+')) {
        lines.push(line.slice(1))
      }
    }
  }
  return lines.join('\n') + (lines.length > 0 ? '\n' : '')
}

/**
 * Apply hunks to existing content.
 */
function applyHunks(content, hunks, fuzz = 0) {
  let lines = content.split('\n')
  // Apply hunks in reverse order to preserve line numbers
  const sortedHunks = [...hunks].sort((a, b) => b.oldStart - a.oldStart)

  for (const hunk of sortedHunks) {
    const result = applyOneHunk(lines, hunk, fuzz)
    if (result.error) return result
    lines = result.lines
  }

  let result = lines.join('\n')
  // Ensure file ends with newline if it did originally
  if (content.endsWith('\n') && !result.endsWith('\n')) {
    result += '\n'
  }
  return { content: result }
}

/**
 * Apply a single hunk to lines array.
 */
function applyOneHunk(lines, hunk, fuzz) {
  // Extract context and old lines for matching
  const oldLines = []
  const newLines = []

  for (const line of hunk.lines) {
    if (line.startsWith(' ')) {
      oldLines.push(line.slice(1))
      newLines.push(line.slice(1))
    } else if (line.startsWith('-')) {
      oldLines.push(line.slice(1))
    } else if (line.startsWith('+')) {
      newLines.push(line.slice(1))
    }
  }

  // Try to find the hunk at the expected position (with fuzz)
  const startLine = hunk.oldStart - 1 // 0-based

  for (let offset = 0; offset <= fuzz; offset++) {
    for (const dir of offset === 0 ? [0] : [-1, 1]) {
      const tryStart = startLine + offset * dir
      if (tryStart < 0 || tryStart + oldLines.length > lines.length) continue

      // Check if context matches
      let match = true
      for (let j = 0; j < oldLines.length; j++) {
        if (lines[tryStart + j] !== oldLines[j]) {
          match = false
          break
        }
      }

      if (match) {
        // Apply: replace oldLines with newLines
        lines.splice(tryStart, oldLines.length, ...newLines)
        return { lines }
      }
    }
  }

  return {
    error: `Hunk at line ${hunk.oldStart} does not match`,
    lines,
  }
}

/**
 * Recursively create directories.
 */
async function mkdirp(fs, dirpath) {
  try {
    await fs.stat(dirpath)
    return
  } catch {
    // doesn't exist
  }
  const parent = dirpath.slice(0, dirpath.lastIndexOf('/'))
  if (parent && parent !== dirpath) {
    await mkdirp(fs, parent)
  }
  try {
    await fs.mkdir(dirpath)
  } catch {
    // ignore if exists
  }
}
