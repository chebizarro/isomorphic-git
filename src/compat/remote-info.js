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
      capabilities[k] = (v === undefined || v === null) ? true : v
    }

    const refs = (disc.refs || []).map(r => ({
      name: r.name,
      oid: r.oid,
      peeled: (r.peeled === undefined || r.peeled === null) ? null : r.peeled,
      symbolic: (r.symbolic === undefined || r.symbolic === null) ? null : r.symbolic,
      annotated: !!r.peeled,
      target: (r.peeled === undefined || r.peeled === null) ? null : r.peeled,
    }))

    const head = refs.find(r => r.name === 'HEAD')
    const headInfo = head
      ? {
          symbolic: (head.symbolic === undefined || head.symbolic === null) ? null : head.symbolic,
          oid: (head.oid === undefined || head.oid === null) ? null : head.oid,
        }
      : undefined

    return { protocol: disc.protocol, capabilities, refs, head: headInfo }
  }

  return { getRemoteInfo2 }
}
