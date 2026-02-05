// Runtime compat fetch factory. Currently a thin wrapper preparing for libgit2-like negotiation.
// For now, this delegates progress mapping and returns the transport's response shape.

import { CompatError } from './errors.js'

function normalizeFetchPhase(input) {
  if (input === undefined || input === null) return undefined
  const s = String(input).trim()
  if (!s) return undefined

  const lower = s.toLowerCase()

  // If already canonical, preserve exactly
  if (
    lower === 'negotiation' ||
    lower === 'receiving' ||
    lower === 'indexing' ||
    lower === 'resolving'
  ) {
    return /** @type {'negotiation'|'receiving'|'indexing'|'resolving'} */ (lower)
  }

  // Map common git-like progress strings to canonical phases
  // Examples from legacy output: "Receiving objects", "Indexing objects", "Resolving deltas"
  if (lower.includes('counting objects')) return 'negotiation'
  if (lower.includes('enumerating objects')) return 'negotiation'
  if (lower.includes('finding sources')) return 'negotiation'
  if (lower.includes('negotiat')) return 'negotiation'

  if (lower.includes('receiving objects')) return 'receiving'
  if (lower.includes('receiv')) return 'receiving'
  if (lower.includes('compressing objects')) return 'receiving'

  if (lower.includes('indexing objects')) return 'indexing'
  if (lower.includes('index')) return 'indexing'

  if (lower.includes('resolving deltas')) return 'resolving'
  if (lower.includes('resolv')) return 'resolving'

  return undefined
}

function validateFetchArgs(opts) {
  if (!opts || typeof opts !== 'object') {
    throw new CompatError(
      'EINVALIDSPEC',
      'Invalid fetch options: expected an options object',
      {
        opts,
      }
    )
  }

  const depth = opts.depth
  const since = opts.since

  const depthIsNullish = depth === undefined || depth === null
  const sinceIsNullish = since === undefined || since === null

  if (!depthIsNullish) {
    if (typeof depth !== 'number' || !Number.isFinite(depth) || depth < 0) {
      throw new CompatError(
        'EINVALIDSPEC',
        `Invalid fetch options: depth must be null/undefined or a number >= 0 (got ${String(
          depth
        )})`
      )
    }
  }

  if (!sinceIsNullish) {
    if (!(since instanceof Date)) {
      throw new CompatError(
        'EINVALIDSPEC',
        `Invalid fetch options: since must be null/undefined or a Date (got ${Object.prototype.toString.call(
          since
        )})`,
        { since }
      )
    }

    if (!Number.isFinite(since.getTime())) {
      throw new CompatError(
        'EINVALIDSPEC',
        'Invalid fetch options: since must be a valid Date',
        { since }
      )
    }
  }

  // libgit2-like mutual exclusion: depth vs since
  if (!depthIsNullish && !sinceIsNullish) {
    throw new CompatError(
      'EINVALIDSPEC',
      'Invalid fetch options: depth and since are mutually exclusive',
      { depth, since }
    )
  }
}

export function createFetchCompat(transport) {
  if (!transport || typeof transport.performFetch !== 'function') {
    throw new CompatError(
      'EINVALIDSPEC',
      'Invalid fetch transport: expected an object with a performFetch function'
    )
  }

  async function fetch(opts) {
    // Pass through to transport which returns the standard FetchResult
    validateFetchArgs(opts)

    const PHASES = /** @type {const} */ ([
      'negotiation',
      'receiving',
      'indexing',
      'resolving',
    ])
    const phaseIndex = p => PHASES.indexOf(p)

    let lastEmittedIndex = -1
    const emitted = new Set()

    const userOnProgress = opts && opts.onProgress ? opts.onProgress : undefined

    const onProgress =
      userOnProgress &&
      (p => {
        const normalized = normalizeFetchPhase(p && p.phase)
        if (!normalized) {
          // If we can't normalize the phase, do not emit a non-canonical phase in compat mode.
          return
        }

        const idx = phaseIndex(normalized)
        if (idx < 0) return

        if (idx < lastEmittedIndex) {
          return
        }

        // Enforce ordering by emitting missing earlier phases (placeholder events)
        for (let i = lastEmittedIndex + 1; i < idx; i++) {
          const missing = PHASES[i]
          if (!emitted.has(missing)) {
            emitted.add(missing)
            lastEmittedIndex = i
            userOnProgress({ phase: missing, loaded: 0, total: 0 })
          }
        }

        // Emit the normalized event (preserve loaded/total if present)
        if (!emitted.has(normalized)) {
          emitted.add(normalized)
        }
        lastEmittedIndex = Math.max(lastEmittedIndex, idx)

        userOnProgress({
          ...p,
          phase: normalized,
        })
      })

    // Normalize depth/since: undefined → null for consistency
    const normalizedOpts = {
      ...opts,
      onProgress,
      depth:
        opts.depth === undefined || opts.depth === null ? null : opts.depth,
      since:
        opts.since === undefined || opts.since === null ? null : opts.since,
    }

    return await transport.performFetch(normalizedOpts)
  }
  return { fetch }
}
