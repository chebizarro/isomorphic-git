// Adapter wrapping the legacy _push to provide a compat transport surface.
import { _push } from '../../commands/push.js'
import { GitPushError } from '../../errors/GitPushError.js'
import { FileSystem } from '../../models/FileSystem.js'
import {
  CompatError,
  mapLegacyPushMessageToCode,
  mapThrownErrorToCode,
} from '../errors.js'

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
      if (item && item !== 'unpack')
        updates.push({ ref: String(item), ok: true })
    }
    if (Array.isArray(res.errors)) {
      // errors may be formatted strings like "refs/heads/x reason"
      for (const e of res.errors) {
        const m = String(e)
        // naive parse: split first space
        const sp = m.indexOf(' ')
        const ref = sp > 0 ? m.slice(0, sp) : m
        updates.push({
          ref,
          ok: false,
          message: m,
          code: mapLegacyPushMessageToCode(m),
        })
      }
    }
  }
  const rejected = updates.filter(u => !u.ok).map(u => u.ref)

  // Backward-compatible fields: legacy code expects res.ok (boolean) and
  // res.refs ({ [ref]: { ok, message } }). These mirror the pre-compat
  // PushResult shape so existing consumers continue to work unchanged.
  const overallOk = updates.length > 0 && updates.every(u => u.ok)
  const refsMap = Object.fromEntries(
    updates.map(u => [u.ref, { ok: u.ok, message: u.message }])
  )

  return { updates, rejected, ok: overallOk, refs: refsMap }
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
        agent: opts.agent,
      })

      return legacyPushResultToCompat(res)
    } catch (e) {
      if (e instanceof GitPushError) {
        const data = /** @type {any} */ (e).data
        const result = (data && data.result) || data

        // Treat overall unpack failures as hard errors (throw), not per-ref status updates.
        // In dimorphic-git PushResult, `ok === false` indicates an unpack failure.
        if (result && typeof result.ok === 'boolean' && result.ok === false) {
          throw new CompatError(
            'EPROTOCOL',
            (result && result.error) ||
              'Remote failed to unpack the sent packfile',
            result
          )
        }

        // Per-ref rejections: return structured statuses instead of throwing.
        return legacyPushResultToCompat(result || {})
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
