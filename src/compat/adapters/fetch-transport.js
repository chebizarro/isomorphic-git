// Adapter wrapping the legacy _fetch to provide a compat transport surface.
import { _fetch } from '../../commands/fetch.js'
import { FileSystem } from '../../models/FileSystem.js'

/**
 * Compat fetch transport adapter.
 *
 * @param {Object} opts
 * @param {import('../../models/FileSystem.js').FileSystem | any} [opts.fs]
 * @param {Object} [opts.cache]
 * @param {import('../../typedefs.js').HttpClient} [opts.http]
 * @param {(e: { phase: 'negotiation'|'receiving'|'indexing', loaded?: number, total?: number }) => void} [opts.onProgress]
 * @param {(msg: any) => void} [opts.onMessage]
 * @param {import('../../typedefs.js').AuthCallback} [opts.onAuth]
 * @param {import('../../typedefs.js').AuthSuccessCallback} [opts.onAuthSuccess]
 * @param {import('../../typedefs.js').AuthFailureCallback} [opts.onAuthFailure]
 * @param {string} [opts.gitdir]
 * @param {string} [opts.ref]
 * @param {string} [opts.remote]
 * @param {string} [opts.remoteRef]
 * @param {string} [opts.url]
 * @param {string} [opts.corsProxy]
 * @param {number|null|undefined} [opts.depth]
 * @param {Date|number|null|undefined} [opts.since]
 * @param {string[]} [opts.exclude]
 * @param {boolean} [opts.relative]
 * @param {boolean} [opts.tags]
 * @param {boolean} [opts.singleBranch]
 * @param {Object} [opts.headers]
 * @param {boolean} [opts.prune]
 * @param {boolean} [opts.pruneTags]
 */
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
