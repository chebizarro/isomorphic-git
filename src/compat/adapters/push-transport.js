// Adapter wrapping the legacy _push to provide a compat transport surface.
import { _push } from '../../commands/push.js'
import { GitPushError } from '../../errors/GitPushError.js'
import { CompatError, mapLegacyPushMessageToCode, mapThrownErrorToCode } from '../errors'
import { FileSystem } from '../../models/FileSystem.js'

function legacyPushResultToCompat(res) {
  const updates = []
  if (res && res.refs && typeof res.refs === 'object') {
    for (const [ref, info] of Object.entries(res.refs)) {
      const ok = !!info.ok
      const message = info.message || info.error
      const entry = { ref, ok, message }
      if (!ok && message) {
        entry.code = mapLegacyPushMessageToCode(String(message))
      }
      updates.push(entry)
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
        updates.push({ ref, ok: false, message: m, code: mapLegacyPushMessageToCode(m) })
      }
    }
  }
  const rejected = updates.filter(u => !u.ok).map(u => u.ref)
  return { updates, rejected }
}

export const pushTransport = {
  async performPush(opts) {
    try {
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

      return legacyPushResultToCompat(res)
    } catch (e) {
      if (e instanceof GitPushError) {
        const data = /** @type {any} */ (e).data

        // Treat overall unpack failures as hard errors (throw), not per-ref status updates.
        const unpackFailed =
          (data && typeof data.ok === 'boolean' && data.ok === false) ||
          (data &&
            Array.isArray(data.ok) &&
            data.ok.length > 0 &&
            String(data.ok[0]).startsWith('unpack ') &&
            String(data.ok[0]) !== 'unpack')

        if (unpackFailed) {
          throw new CompatError(
            'EPROTOCOL',
            'Remote failed to unpack the sent packfile',
            data
          )
        }

        // Per-ref rejections: return structured statuses instead of throwing.
        return legacyPushResultToCompat(data || {})
      }

      // Transport / protocol / network errors: rethrow as CompatError using taxonomy mapping.
      const code = mapThrownErrorToCode(e)
      if (code !== 'EINTERNAL') {
        const message = e instanceof Error ? e.message : String(e)
        throw new CompatError(code, message, e)
      }

      // Preserve unexpected internal errors unchanged.
      throw e
    }
  },
}
