// Runtime compat push factory. Thin wrapper for progress/result mapping.

export function createPushCompat(transport) {
  async function push(opts) {
    const res = await transport.upload({
      url: opts.url,
      refspecs: opts.refspecs,
      force: opts.force,
      onProgress: p => opts.onProgress?.({ writtenObjects: p.writtenObjects, totalObjects: p.totalObjects }),
    })
    return res
  }
  return { push }
}
