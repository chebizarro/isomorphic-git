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
      depth: opts.depth ?? null,
      since: opts.since ?? null,
      exclude: opts.exclude || [],
      relative: opts.relative || false,
      tags: opts.tags || false,
      singleBranch: opts.singleBranch || false,
      headers: opts.headers || {},
      prune: opts.prune || false,
      pruneTags: opts.pruneTags || false,
    })
  },
}
