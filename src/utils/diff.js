/**
 * Myers diff algorithm — compute the shortest edit script between two sequences.
 *
 * Returns an array of operations: { type: 'equal'|'insert'|'delete', lines: string[] }
 *
 * @param {string[]} a - Old lines
 * @param {string[]} b - New lines
 * @returns {Array<{type: 'equal'|'insert'|'delete', lines: string[]}>}
 */
export function myersDiff(a, b) {
  const N = a.length
  const M = b.length
  const MAX = N + M

  if (MAX === 0) return []

  // Optimization: if one side is empty, return all insert/delete
  if (N === 0) return [{ type: 'insert', lines: b.slice() }]
  if (M === 0) return [{ type: 'delete', lines: a.slice() }]

  // V array stores furthest-reaching x for each diagonal k
  // We use offset MAX so index = k + MAX
  const size = 2 * MAX + 1
  const V = new Int32Array(size).fill(-1)
  V[MAX + 1] = 0 // k=1 diagonal starts at x=0

  // Store traces for backtracking
  const traces = []

  let found = false
  for (let d = 0; d <= MAX; d++) {
    traces.push(V.slice())
    for (let k = -d; k <= d; k += 2) {
      const kIdx = k + MAX
      let x
      if (k === -d || (k !== d && V[kIdx - 1] < V[kIdx + 1])) {
        x = V[kIdx + 1] // move down (insert)
      } else {
        x = V[kIdx - 1] + 1 // move right (delete)
      }
      let y = x - k

      // Follow diagonal (equal elements)
      while (x < N && y < M && a[x] === b[y]) {
        x++
        y++
      }

      V[kIdx] = x

      if (x >= N && y >= M) {
        found = true
        break
      }
    }
    if (found) break
  }

  // Backtrack to find the actual edit path
  const edits = backtrack(traces, a, b, MAX)
  return compactEdits(edits)
}

function backtrack(traces, a, b, MAX) {
  const N = a.length
  const M = b.length
  let x = N
  let y = M
  const edits = []

  for (let d = traces.length - 1; d > 0; d--) {
    const V = traces[d]
    const k = x - y
    const kIdx = k + MAX

    let prevK
    if (k === -d || (k !== d && V[kIdx - 1] < V[kIdx + 1])) {
      prevK = k + 1 // came from insert (down)
    } else {
      prevK = k - 1 // came from delete (right)
    }

    const prevX = V[prevK + MAX]
    const prevY = prevX - prevK

    // Diagonal (equal) moves
    while (x > prevX && y > prevY) {
      x--
      y--
      edits.unshift({ type: 'equal', line: a[x] })
    }

    if (d > 0) {
      if (x === prevX) {
        // Insert
        y--
        edits.unshift({ type: 'insert', line: b[y] })
      } else {
        // Delete
        x--
        edits.unshift({ type: 'delete', line: a[x] })
      }
    }
  }

  // Handle remaining diagonal at d=0
  while (x > 0 && y > 0) {
    x--
    y--
    edits.unshift({ type: 'equal', line: a[x] })
  }

  return edits
}

function compactEdits(edits) {
  if (edits.length === 0) return []
  const result = []
  let current = { type: edits[0].type, lines: [edits[0].line] }

  for (let i = 1; i < edits.length; i++) {
    if (edits[i].type === current.type) {
      current.lines.push(edits[i].line)
    } else {
      result.push(current)
      current = { type: edits[i].type, lines: [edits[i].line] }
    }
  }
  result.push(current)
  return result
}

/**
 * Generate diff hunks from two text contents.
 *
 * @param {string} oldContent - Old file content
 * @param {string} newContent - New file content
 * @param {number} [contextLines=3] - Number of context lines around changes
 * @returns {Array<{oldStart: number, oldLines: number, newStart: number, newLines: number, lines: string[]}>}
 */
export function generateHunks(oldContent, newContent, contextLines = 3) {
  const oldLines = oldContent ? oldContent.split('\n') : []
  const newLines = newContent ? newContent.split('\n') : []

  const edits = myersDiff(oldLines, newLines)

  // Flatten edits to annotated lines with line numbers
  const annotated = []
  let oldIdx = 0
  let newIdx = 0

  for (const edit of edits) {
    for (const line of edit.lines) {
      if (edit.type === 'equal') {
        annotated.push({ type: ' ', line, oldLine: oldIdx, newLine: newIdx })
        oldIdx++
        newIdx++
      } else if (edit.type === 'delete') {
        annotated.push({ type: '-', line, oldLine: oldIdx, newLine: -1 })
        oldIdx++
      } else {
        annotated.push({ type: '+', line, oldLine: -1, newLine: newIdx })
        newIdx++
      }
    }
  }

  // Find change regions and expand with context
  const changeIndices = []
  for (let i = 0; i < annotated.length; i++) {
    if (annotated[i].type !== ' ') {
      changeIndices.push(i)
    }
  }

  if (changeIndices.length === 0) return []

  // Group nearby changes into hunks
  const groups = []
  let groupStart = changeIndices[0]
  let groupEnd = changeIndices[0]

  for (let i = 1; i < changeIndices.length; i++) {
    if (changeIndices[i] - groupEnd <= contextLines * 2 + 1) {
      groupEnd = changeIndices[i]
    } else {
      groups.push([groupStart, groupEnd])
      groupStart = changeIndices[i]
      groupEnd = changeIndices[i]
    }
  }
  groups.push([groupStart, groupEnd])

  // Build hunks
  const hunks = []
  for (const [gStart, gEnd] of groups) {
    const start = Math.max(0, gStart - contextLines)
    const end = Math.min(annotated.length - 1, gEnd + contextLines)

    const hunkLines = []
    let oldStart = -1
    let newStart = -1
    let oldCount = 0
    let newCount = 0

    for (let i = start; i <= end; i++) {
      const a = annotated[i]
      hunkLines.push(`${a.type}${a.line}`)

      if (a.type === ' ') {
        if (oldStart < 0) {
          oldStart = a.oldLine
          newStart = a.newLine
        }
        oldCount++
        newCount++
      } else if (a.type === '-') {
        if (oldStart < 0) {
          oldStart = a.oldLine
          // Find the next context or insert line for newStart
          newStart = a.newLine >= 0 ? a.newLine : newIdx
          for (let j = i + 1; j <= end; j++) {
            if (annotated[j].newLine >= 0) {
              newStart = annotated[j].newLine
              break
            }
          }
        }
        oldCount++
      } else {
        if (oldStart < 0) {
          oldStart = a.oldLine >= 0 ? a.oldLine : oldIdx
          newStart = a.newLine
          for (let j = i + 1; j <= end; j++) {
            if (annotated[j].oldLine >= 0) {
              oldStart = annotated[j].oldLine
              break
            }
          }
        }
        newCount++
      }
    }

    hunks.push({
      oldStart: (oldStart >= 0 ? oldStart : 0) + 1, // 1-based
      oldLines: oldCount,
      newStart: (newStart >= 0 ? newStart : 0) + 1, // 1-based
      newLines: newCount,
      lines: hunkLines,
    })
  }

  return hunks
}
