// @ts-check
import '../typedefs.js'

/**
 * Clean up a commit message — strip comments, excess whitespace,
 * and ensure a trailing newline.
 * Equivalent to libgit2's `git_message_prettify`.
 *
 * @param {object} args
 * @param {string} args.message - The raw commit message
 * @param {boolean} [args.stripComments=true] - Remove comment lines
 * @param {string} [args.commentChar='#'] - The comment character
 * @returns {string} The cleaned-up message
 */
export function messagePrettify({
  message,
  stripComments = true,
  commentChar = '#',
}) {
  if (!message) return '\n'

  let lines = message.split('\n')

  // Strip comment lines if requested
  if (stripComments) {
    lines = lines.filter(line => !line.startsWith(commentChar))
  }

  // Strip trailing whitespace from each line
  lines = lines.map(line => line.trimEnd())

  // Collapse consecutive blank lines into a single blank line
  const result = []
  let prevBlank = false
  for (const line of lines) {
    const isBlank = line.length === 0
    if (isBlank && prevBlank) continue
    result.push(line)
    prevBlank = isBlank
  }

  // Strip leading blank lines
  while (result.length > 0 && result[0].length === 0) {
    result.shift()
  }

  // Strip trailing blank lines
  while (result.length > 0 && result[result.length - 1].length === 0) {
    result.pop()
  }

  // Empty message after stripping
  if (result.length === 0) return '\n'

  // Ensure trailing newline
  return result.join('\n') + '\n'
}

/**
 * Parse trailers from a commit message.
 * Equivalent to libgit2's `git_message_trailers`.
 *
 * Trailers are key/value pairs in the last paragraph of a message.
 * A trailer line has the format: `Key: Value` or `Key #Value`.
 *
 * Examples:
 *   Signed-off-by: Jane <jane@example.com>
 *   Co-authored-by: John <john@example.com>
 *   Fixes #123
 *
 * @param {object} args
 * @param {string} args.message - The commit message to parse
 * @returns {Array<{key: string, value: string}>} Array of trailer key/value pairs
 */
export function messageTrailers({ message }) {
  if (!message) return []

  // Find the last paragraph (separated by blank lines)
  const lines = message.trimEnd().split('\n')

  // Find the start of the last paragraph
  let lastParagraphStart = 0
  for (let i = lines.length - 1; i >= 0; i--) {
    if (lines[i].trim().length === 0) {
      lastParagraphStart = i + 1
      break
    }
  }

  // If the entire message is one paragraph and it's a single line,
  // there are no trailers (the body is the subject line)
  if (lastParagraphStart === 0 && lines.length <= 1) return []

  const trailerLines = lines.slice(lastParagraphStart)

  // A paragraph is considered trailers if ALL non-blank lines
  // match the trailer format: "Key: Value" or continuation lines starting with whitespace
  const trailers = []
  const trailerRe = /^([\w][\w-]*)\s*:\s*(.+)$/

  let allTrailers = true
  for (const line of trailerLines) {
    if (line.trim().length === 0) continue

    // Continuation line (starts with whitespace)
    if (/^\s+/.test(line) && trailers.length > 0) {
      trailers[trailers.length - 1].value += ' ' + line.trim()
      continue
    }

    const match = trailerRe.exec(line)
    if (match) {
      trailers.push({ key: match[1], value: match[2].trim() })
    } else {
      allTrailers = false
      break
    }
  }

  // Only return trailers if the entire last paragraph was valid trailers
  if (!allTrailers) return []

  return trailers
}
