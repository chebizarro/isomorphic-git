// JS-only fetch negotiation that targets libgit2-like behavior for wants/haves, shallow/deepen, and progress events.

import type { CompatAPI, FetchOptions } from './backend'
import { err } from './errors'

export interface PackTransport {
  negotiate(opts: {
    url: string
    depth?: number
    since?: Date
    exclude?: string[]
    refspecs?: string[]
    onProgress?: (p: { phase: string; receivedBytes?: number }) => void
  }): Promise<{ updatedRefs: string[] }>
}

export function createFetchCompat(transport: PackTransport): Pick<CompatAPI, 'fetch'> {
  async function fetch(opts: FetchOptions): Promise<{ updatedRefs: string[] }> {
    // Validate inputs, normalize refspecs, map shallow/deepen flags.
    // Implement refspec resolution consistent with libgit2 expectations.
    const res = await transport.negotiate({
      url: opts.url,
      depth: opts.depth,
      since: opts.since,
      exclude: opts.exclude,
      refspecs: opts.refspecs,
      onProgress: p =>
        opts.onProgress?.({
          receivedObjects: 0,
          indexedObjects: 0,
          receivedBytes: p.receivedBytes ?? 0,
          phase: p.phase as any,
        }),
    })
    return { updatedRefs: res.updatedRefs }
  }

  return { fetch }
}
