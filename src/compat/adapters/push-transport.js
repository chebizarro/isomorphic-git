// Adapter wrapping the legacy _push to provide a compat transport surface.
import { _push } from '../../commands/push.js'
import { FileSystem } from '../../models/FileSystem.js'

export const pushTransport = {
  async performPush(opts) {
    const res = await _push({
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
    // Map legacy result to compat PushResult
    // Legacy may return: { ok: string[], errors: string[], refs: Record<ref, { ok: boolean, message?: string }> }
    const updates = []
    if (res && res.refs && typeof res.refs === 'object') {
      for (const [ref, info] of Object.entries(res.refs)) {
        updates.push({ ref, ok: !!info.ok, message: info.message || info.error })
      }
    } else if (Array.isArray(res && res.ok)) {
      // Fallback: treat ok list as successful refs except the first 'unpack'
      for (const item of res.ok) {
        if (item && item !== 'unpack') updates.push({ ref: String(item), ok: true })
      }
      if (Array.isArray(res.errors)) {
        // errors may be formatted strings like "refs/heads/x reason"
        for (const e of res.errors) {
          const m = String(e)
          // naive parse: split first space
          const sp = m.indexOf(' ')
          const ref = sp > 0 ? m.slice(0, sp) : m
          updates.push({ ref, ok: false, message: m })
        }
      }
    }
    const rejected = updates.filter(u => !u.ok).map(u => u.ref)
    return { updates, rejected }
  },
}
