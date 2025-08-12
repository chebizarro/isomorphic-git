// Adapter wrapping the legacy _fetch to provide a compat transport surface.
import { _fetch } from '../../commands/fetch.js'
import { FileSystem } from '../../models/FileSystem.js'

export const fetchTransport = {
  async performFetch(opts) {
    // Delegate directly to legacy _fetch to preserve behavior while compat evolves
    return await _fetch({
      fs: new FileSystem(opts.fs),
      cache: opts.cache || {},
      http: opts.http,
      onProgress: opts.onProgress,
      onMessage: opts.onMessage,
      onAuth: opts.onAuth,
      onAuthSuccess: opts.onAuthSuccess,
      onAuthFailure: opts.onAuthFailure,
      gitdir: opts.gitdir,
      ref: opts.ref,
      remote: opts.remote,
      remoteRef: opts.remoteRef,
      url: opts.url,
      corsProxy: opts.corsProxy,
      depth: (opts.depth === undefined || opts.depth === null) ? null : opts.depth,
      since: (opts.since === undefined || opts.since === null) ? null : opts.since,
      exclude: opts.exclude || [],
      relative: !!opts.relative,
      tags: !!opts.tags,
      singleBranch: !!opts.singleBranch,
      headers: opts.headers || {},
      prune: !!opts.prune,
      pruneTags: !!opts.pruneTags,
    })
  },
}
