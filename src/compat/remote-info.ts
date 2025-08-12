// JS-only remote discovery aligned with libgit2 semantics (parsing, symrefs, peeling hints).
// NOTE: The HTTP exchange should reuse the project's HTTP transport; we only refine parsing & invariants here.

import type { CompatAPI, RemoteInfo, RemoteRef, AuthHint, AuthResult } from './backend'
import { err, CompatError } from './errors'

// Injected transport (existing isomorphic-git http client or adapter).
export interface HttpTransport {
  discover(
    url: string,
    opts?: {
      onAuth?: (h: AuthHint) => Promise<AuthResult> | AuthResult
    }
  ): Promise<{
    protocol: 'v1' | 'v2'
    capabilities: string[]
    refs: Array<{ name: string; oid: string; peeled?: string; symbolic?: string }>
  }>
}

export function createRemoteInfoCompat(
  transport: HttpTransport
): Pick<CompatAPI, 'getRemoteInfo2'> {
  async function getRemoteInfo2(
    url: string,
    opts?: { onAuth?: (h: AuthHint) => Promise<AuthResult> | AuthResult }
  ): Promise<RemoteInfo> {
    const disc = await transport.discover(url, { onAuth: opts?.onAuth })

    const capabilities: Record<string, string | true> = {}
    for (const cap of disc.capabilities) {
      const [k, v] = cap.split('=')
      capabilities[k] = v ?? true
    }

    const refs: RemoteRef[] = disc.refs.map(r => ({
      name: r.name,
      oid: r.oid,
      peeled: r.peeled ?? null,
      symbolic: r.symbolic ?? null,
      annotated: !!r.peeled,
      target: r.peeled ?? null,
    }))

    // HEAD: prefer symbolic when available; else attach oid.
    const head = refs.find(r => r.name === 'HEAD')
    const headInfo = head ? { symbolic: head.symbolic ?? null, oid: head.oid ?? null } : undefined

    return {
      protocol: disc.protocol,
      capabilities,
      refs,
      head: headInfo,
    }
  }

  return { getRemoteInfo2 }
}
