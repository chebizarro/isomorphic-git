// Runtime compat push factory. Thin wrapper for progress/result mapping.
import { mapLegacyPushMessageToCode } from './errors'

export function createPushCompat(transport) {
  async function push(opts) {
    const res = await transport.performPush({
      url: opts.url,
      refspecs: opts.refspecs,
      force: opts.force,
      onProgress: p => {
        if (opts.onProgress) {
          opts.onProgress({
            writtenObjects: p.writtenObjects,
            totalObjects: p.totalObjects,
          })
        }
      },
    })
    // Ensure failed updates carry a compat error code, even if the transport
    // already shaped { updates, rejected } without codes.
    if (res && Array.isArray(res.updates)) {
      for (const u of res.updates) {
        if (!u.ok && u.message && !u.code) {
          u.code = mapLegacyPushMessageToCode(String(u.message))
        }
      }
    }
    return res
  }
  return { push }
}
