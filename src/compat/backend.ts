// Internal "compat" entrypoints. These mirror the public API but are not exported from the package root.
// They will be invoked when LIBGIT2_COMPAT=true during the migration period.

export type OID = string;

export interface RemoteRef {
  name: string;              // e.g. "refs/heads/main"
  oid: OID;                  // peeled OID if available (40-hex)
  target?: OID | null;       // tag target or symref target OID when applicable
  symbolic?: string | null;  // e.g. "refs/heads/main" when HEAD -> refs/heads/main
  peeled?: OID | null;       // peeled tag -> commit
  annotated?: boolean;       // annotated tag indicator
}

export interface RemoteInfo {
  protocol: 'v1' | 'v2';
  capabilities: Record<string, string | true>;
  refs: RemoteRef[];
  head?: { symbolic?: string | null; oid?: OID | null };
}

export interface FetchOptions {
  url: string;
  depth?: number;
  since?: Date;
  exclude?: string[];
  refspecs?: string[];
  onProgress?: (p: FetchProgress) => void;
  onAuth?: (hint: AuthHint) => Promise<AuthResult> | AuthResult;
}

export interface FetchProgress {
  receivedObjects: number;
  receivedBytes: number;
  indexedObjects: number;
  totalObjects?: number;
  totalDeltas?: number;
  phase?: 'negotiation' | 'receiving' | 'indexing' | 'resolving';
}

export interface PushOptions {
  url: string;
  refspecs: string[];
  force?: boolean;
  onAuth?: (hint: AuthHint) => Promise<AuthResult> | AuthResult;
  onProgress?: (p: PushProgress) => void;
}

export interface PushProgress {
  writtenObjects: number;
  totalObjects?: number;
  remoteStatus?: Array<{ ref: string; ok: boolean; message?: string }>;
}

export type AuthHint = {
  url: string;
  username?: string;
  type: 'http' | 'ssh';
};

export type AuthResult =
  | { type: 'http'; username?: string; password?: string; token?: string }
  | { type: 'ssh'; username?: string; privateKey?: string; passphrase?: string; agent?: boolean };

export interface CompatAPI {
  getRemoteInfo2(
    url: string,
    opts?: {
      http?: unknown
      onAuth?: (h: AuthHint) => Promise<AuthResult> | AuthResult
      onAuthSuccess?: (r: unknown) => void
      onAuthFailure?: (r: unknown) => void
      corsProxy?: string
      headers?: Record<string, string>
      forPush?: boolean
      protocolVersion?: 1 | 2
    }
  ): Promise<RemoteInfo>;
  fetch(opts: FetchOptions): Promise<{
    defaultBranch?: string
    fetchHead?: OID
    fetchHeadDescription?: string
    headers?: Record<string, string>
    pruned: string[]
    updatedRefs?: string[]
  }>;
  push(opts: PushOptions): Promise<{ updates: Array<{ ref: string; ok: boolean; message?: string }>; rejected: string[] }>;
}
