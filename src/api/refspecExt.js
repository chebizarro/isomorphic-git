// @ts-check
import '../typedefs.js'

/**
 * Parse a refspec string into its components.
 * Equivalent to libgit2's refspec parsing.
 *
 * Format: [+]<src>:<dst>
 *
 * @param {string} refspec - The refspec string
 * @returns {{force: boolean, src: string, dst: string, direction: string}|null}
 */
export function refspecParse(refspec) {
  if (!refspec || typeof refspec !== 'string') return null

  let force = false
  let rest = refspec

  if (rest.startsWith('+')) {
    force = true
    rest = rest.slice(1)
  }

  const colonIdx = rest.indexOf(':')
  if (colonIdx === -1) {
    return { force, src: rest, dst: '', direction: 'fetch' }
  }

  const src = rest.slice(0, colonIdx)
  const dst = rest.slice(colonIdx + 1)

  return { force, src, dst, direction: dst ? 'fetch' : 'fetch' }
}

/**
 * Transform a ref name through a refspec.
 * Equivalent to libgit2's `git_refspec_transform`.
 *
 * @param {string} refspec - The refspec string
 * @param {string} name - The ref name to transform
 * @returns {string|null} The transformed name, or null if it doesn't match
 */
export function refspecTransform(refspec, name) {
  const parsed = refspecParse(refspec)
  if (!parsed) return null

  const { src, dst } = parsed

  // Handle wildcard refspecs
  if (src.includes('*') && dst.includes('*')) {
    const srcPrefix = src.slice(0, src.indexOf('*'))
    const srcSuffix = src.slice(src.indexOf('*') + 1)

    if (name.startsWith(srcPrefix) && name.endsWith(srcSuffix)) {
      const middle = name.slice(srcPrefix.length, name.length - srcSuffix.length || undefined)
      const dstPrefix = dst.slice(0, dst.indexOf('*'))
      const dstSuffix = dst.slice(dst.indexOf('*') + 1)
      return dstPrefix + middle + dstSuffix
    }
    return null
  }

  // Exact match
  if (name === src) return dst || name

  return null
}

/**
 * Check if a ref name matches a refspec's source pattern.
 *
 * @param {string} refspec - The refspec string
 * @param {string} name - The ref name to check
 * @returns {boolean}
 */
export function refspecSrcMatches(refspec, name) {
  return refspecTransform(refspec, name) !== null
}
