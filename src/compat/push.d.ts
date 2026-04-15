// Type declarations for src/compat/push.js
// Authoritative implementation is push.js — keep this in sync.

import type { CompatAPI } from './backend';

export interface PushTransport {
  performPush(opts: any): Promise<{
    updates: Array<{ ref: string; ok: boolean; message?: string; code?: string }>;
    rejected: string[];
  }>;
}

export function createPushCompat(transport: PushTransport): Pick<CompatAPI, 'push'>;
