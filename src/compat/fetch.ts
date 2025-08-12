// JS-only fetch negotiation that targets libgit2-like behavior for wants/haves, shallow/deepen, and progress events.

import type { CompatAPI, FetchOptions } from './backend'
import { err } from './errors'

// Align the TS type with the JS runtime adapter which exposes `performFetch`
export interface FetchTransport {
  performFetch(opts: any): Promise<any> // FetchResult shape as returned by legacy _fetch
}

export function createFetchCompat(transport: FetchTransport): Pick<CompatAPI, 'fetch'> {
  async function fetch(opts: FetchOptions): Promise<any> {
    // Validate inputs, normalize refspecs, map shallow/deepen flags as needed later.
    return await transport.performFetch({
      ...opts,
    })
  }

  return { fetch }
}
