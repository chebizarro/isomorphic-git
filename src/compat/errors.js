// JS shim for compat error helpers used by .js modules in tests/build.
// Keep in sync with errors.ts for runtime usage in JS-only paths.

export class CompatError extends Error {
  constructor(code, message, details) {
    super(message)
    this.name = 'CompatError'
    this.code = code
    this.details = details
  }
}

/**
 * @param {string} msg
 * @returns {"EINVALIDSPEC"|"ENONFASTFORWARD"|"EAUTH"|"ENOTFOUND"|"ECONNECTION"|"EPERM"|"ECONFLICT"|"EUNBORN"|"ESHORTREAD"|"EPROTOCOL"|"EUNSUPPORTED"|"EINTERNAL"}
 */
export function mapLegacyPushMessageToCode(msg) {
  const m = String(msg).toLowerCase()

  // Non-fast-forward and related hints
  if (
    m.includes('non-fast-forward') ||
    m.includes('non fast forward') ||
    m.includes('fetch first')
  )
    return 'ENONFASTFORWARD'

  // Invalid refspec / invalid source
  if (
    m.includes('invalid refspec') ||
    m.includes('does not match any') ||
    m.includes('not a valid reference')
  )
    return 'EINVALIDSPEC'

  // Unborn branch / empty repository references
  if (m.includes('unborn') || m.includes('does not have any commits yet'))
    return 'EUNBORN'

  // Short reads / unexpected EOF while reading pack/protocol
  if (
    m.includes('short read') ||
    m.includes('unexpected eof') ||
    m.includes('premature end of pack file')
  )
    return 'ESHORTREAD'

  // Ref lock conflicts / write failures
  if (m.includes('failed to write') || m.includes('cannot lock ref'))
    return 'ECONFLICT'

  // Permission / protected refs / hook rejections
  if (
    m.includes('pre-receive hook declined') ||
    m.includes('hooks declined') ||
    m.includes('hook declined') ||
    m.includes('protected branch')
  )
    return 'EPERM'

  // Authentication
  if (
    m.includes('authentication') ||
    m.includes('auth failed') ||
    m.includes('unauthorized') ||
    m.includes('credential')
  )
    return 'EAUTH'

  // Missing remote refs / targets
  if (
    m.includes('remote: not found') ||
    m.includes('remote ref not found') ||
    (m.includes('remote ref') && m.includes('does not exist')) ||
    m.includes('unknown ref') ||
    m.includes('no such')
  )
    return 'ENOTFOUND'

  // Network / connection-ish failures
  if (
    m.includes('connection reset') ||
    m.includes('connection refused') ||
    m.includes('timed out') ||
    m.includes('timeout') ||
    m.includes('network')
  )
    return 'ECONNECTION'

  // Unsupported shallow push behavior
  if (m.includes('shallow update not allowed')) return 'EUNSUPPORTED'

  // Protocol issues
  if (m.includes('protocol')) return 'EPROTOCOL'

  return 'EINTERNAL'
}

/**
 * @param {unknown} e
 * @returns {"EINVALIDSPEC"|"ENONFASTFORWARD"|"EAUTH"|"ENOTFOUND"|"ECONNECTION"|"EPERM"|"ECONFLICT"|"EUNBORN"|"ESHORTREAD"|"EPROTOCOL"|"EUNSUPPORTED"|"EINTERNAL"}
 */
export function mapThrownErrorToCode(e) {
  // Preserve CompatError codes when re-mapping
  if (e && typeof e === 'object') {
    const anyErr = e
    if (anyErr.name === 'CompatError' && typeof anyErr.code === 'string') {
      return anyErr.code
    }

    // HttpError (from ../errors/HttpError.js) typically carries a numeric statusCode
    const statusCode = anyErr.statusCode
    if (statusCode === 401) return 'EAUTH'
    if (statusCode === 403) return 'EPERM'

    const name = String(anyErr.name || '')
    if (name === 'SmartHttpError') return 'EPROTOCOL'
  }

  const message =
    e instanceof Error
      ? e.message
      : e === null || e === undefined
        ? ''
        : typeof e === 'string'
          ? e
          : String(e)

  const m = message.toLowerCase()

  // Auth / permission errors
  if (
    m.includes('authentication') ||
    m.includes('unauthorized') ||
    m.includes('auth failed')
  )
    return 'EAUTH'
  if (
    m.includes('forbidden') ||
    m.includes('permission denied') ||
    m.includes('protected branch')
  )
    return 'EPERM'

  // Protocol-level parsing issues (pkt-line, malformed wire messages, etc)
  if (
    m.includes('pkt-line') ||
    m.includes('pkt line') ||
    m.includes('protocol error') ||
    m.includes('unexpected pkt') ||
    m.includes('malformed pkt')
  )
    return 'EPROTOCOL'

  // Short read / EOF while reading pack or response body
  if (
    m.includes('short read') ||
    m.includes('unexpected eof') ||
    m.includes('premature end of pack file') ||
    m.includes('unexpected end of file')
  )
    return 'ESHORTREAD'

  // Network / connection failures (Node, browsers, and generic phrasing)
  if (
    m.includes('failed to fetch') ||
    m.includes('fetch failed') ||
    m.includes('network') ||
    m.includes('socket') ||
    m.includes('socket hang up') ||
    m.includes('connection reset') ||
    m.includes('timed out') ||
    m.includes('timeout') ||
    m.includes('econnreset') ||
    m.includes('etimedout') ||
    m.includes('enotfound') ||
    m.includes('eai_again')
  )
    return 'ECONNECTION'

  return 'EINTERNAL'
}
