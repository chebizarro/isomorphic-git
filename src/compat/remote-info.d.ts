// Type declarations for src/compat/remote-info.js
// Authoritative implementation is remote-info.js — keep this in sync.

import type { CompatAPI, AuthHint, AuthResult, RemoteInfo } from './backend';

export interface HttpTransport {
  discover(
    url: string,
    opts?: {
      http?: any;
      onAuth?: (h: AuthHint) => Promise<AuthResult> | AuthResult;
      onAuthSuccess?: (url: string, auth: AuthResult) => void;
      onAuthFailure?: (url: string, auth: AuthResult) => void;
      headers?: Record<string, string>;
      corsProxy?: string;
      forPush?: boolean;
      protocolVersion?: number;
    }
  ): Promise<{
    protocol: 'v1' | 'v2';
    capabilities: string[];
    refs: Array<{ name: string; oid: string; peeled?: string; symbolic?: string }>;
  }>;
}

export function createRemoteInfoCompat(
  transport: HttpTransport
): Pick<CompatAPI, 'getRemoteInfo2'>;
