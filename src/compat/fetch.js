// Runtime compat fetch factory. Currently a thin wrapper preparing for libgit2-like negotiation.
// For now, this delegates progress mapping and returns the transport's response shape.

export function createFetchCompat(transport) {
  async function fetch(opts) {
    // Pass through to transport which returns the standard FetchResult
    return await transport.performFetch({
      ...opts,
      onProgress: opts.onProgress,
    })
  }
  return { fetch }
}
