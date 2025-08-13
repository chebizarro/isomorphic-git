// JS shim for compat error helpers used by .js modules in tests/build.
// Keep in sync with errors.ts for runtime usage in JS-only paths.

/**
 * @param {string} msg
 * @returns {"EINVALIDSPEC"|"ENONFASTFORWARD"|"EAUTH"|"ENOTFOUND"|"ECONNECTION"|"EPERM"|"ECONFLICT"|"EUNBORN"|"ESHORTREAD"|"EPROTOCOL"|"EUNSUPPORTED"|"EINTERNAL"}
 */
function mapLegacyPushMessageToCode(msg) {
  const m = String(msg).toLowerCase()
  if (m.includes('non-fast-forward') || m.includes('non fast forward')) return 'ENONFASTFORWARD'
  if (m.includes('failed to write') || m.includes('cannot lock ref')) return 'ECONFLICT'
  if (
    m.includes('pre-receive hook declined') ||
    m.includes('hooks declined') ||
    m.includes('hook declined') ||
    m.includes('protected branch')
  ) return 'EPERM'
  if (m.includes('authentication') || m.includes('auth failed') || m.includes('unauthorized')) return 'EAUTH'
  if (m.includes('not found') || m.includes('does not exist')) return 'ENOTFOUND'
  if (m.includes('connection') || m.includes('network')) return 'ECONNECTION'
  if (m.includes('shallow update not allowed')) return 'EUNSUPPORTED'
  if (m.includes('protocol')) return 'EPROTOCOL'
  return 'EINTERNAL'
}

module.exports = {
  mapLegacyPushMessageToCode,
}
