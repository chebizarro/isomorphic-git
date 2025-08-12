// JS-only remote discovery aligned with libgit2 semantics (parsing, symrefs, peeling hints).

export function createRemoteInfoCompat(transport) {
  async function getRemoteInfo2(url, opts = {}) {
    const disc = await transport.discover(url, {
      http: opts.http,
      onAuth: opts.onAuth,
      onAuthSuccess: opts.onAuthSuccess,
      onAuthFailure: opts.onAuthFailure,
      headers: opts.headers,
      corsProxy: opts.corsProxy,
      forPush: opts.forPush,
      protocolVersion: opts.protocolVersion,
    })

    const capabilities = {}
    for (const cap of disc.capabilities) {
      const [k, v] = cap.split('=')
      capabilities[k] = v ?? true
    }

    const refs = (disc.refs || []).map(r => ({
      name: r.name,
      oid: r.oid,
      peeled: r.peeled ?? null,
      symbolic: r.symbolic ?? null,
      annotated: !!r.peeled,
      target: r.peeled ?? null,
    }))

    const head = refs.find(r => r.name === 'HEAD')
    const headInfo = head ? { symbolic: head.symbolic ?? null, oid: head.oid ?? null } : undefined

    return { protocol: disc.protocol, capabilities, refs, head: headInfo }
  }

  return { getRemoteInfo2 }
}
