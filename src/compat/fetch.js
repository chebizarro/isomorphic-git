// Runtime compat fetch factory. Currently a thin wrapper preparing for libgit2-like negotiation.
// For now, this delegates progress mapping and returns the transport's response shape.

export function createFetchCompat(transport) {
  async function fetch(opts) {
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
          phase: p.phase,
        }),
    })
    return { updatedRefs: res.updatedRefs }
  }
  return { fetch }
}
