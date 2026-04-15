// Type declarations for src/compat/fetch.js
// Authoritative implementation is fetch.js — keep this in sync.

import type { CompatAPI, FetchOptions } from './backend';

export interface FetchTransport {
  performFetch(opts: any): Promise<any>;
}

export function createFetchCompat(transport: FetchTransport): Pick<CompatAPI, 'fetch'>;
