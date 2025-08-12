// Adapter wrapping the legacy _push to provide a compat transport surface.
import { _push } from '../../commands/push.js'
import { FileSystem } from '../../models/FileSystem.js'

export const pushTransport = {
  async performPush(opts) {
    return await _push({
      fs: new FileSystem(opts.fs),
      cache: opts.cache || {},
      http: opts.http,
      onProgress: opts.onProgress,
      onMessage: opts.onMessage,
      onAuth: opts.onAuth,
      onAuthSuccess: opts.onAuthSuccess,
      onAuthFailure: opts.onAuthFailure,
      onPrePush: opts.onPrePush,
      gitdir: opts.gitdir,
      ref: opts.ref,
      remoteRef: opts.remoteRef,
      remote: opts.remote,
      url: opts.url,
      force: !!opts.force,
      delete: !!opts.delete,
      corsProxy: opts.corsProxy,
      headers: opts.headers || {},
    })
  },
}
