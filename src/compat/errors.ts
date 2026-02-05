// Consolidated error taxonomy that mirrors libgit2 semantics without depending on it.

export type CompatErrorCode =
  | 'EINVALIDSPEC'
  | 'ENONFASTFORWARD'
  | 'EAUTH'
  | 'ENOTFOUND'
  | 'ECONNECTION'
  | 'EPERM'
  | 'ECONFLICT'
  | 'EUNBORN'
  | 'ESHORTREAD'
  | 'EPROTOCOL'
  | 'EUNSUPPORTED'
  | 'EINTERNAL';

export class CompatError extends Error {
  code: CompatErrorCode;
  details?: unknown;
  constructor(code: CompatErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = 'CompatError';
    this.code = code;
    this.details = details;
  }
}

export const err = {
  nonFastForward(ref: string) {
    return new CompatError(
      'ENONFASTFORWARD',
      `Non-fast-forward update rejected for ${ref}`
    );
  },
  invalidSpec(msg: string) {
    return new CompatError('EINVALIDSPEC', msg);
  },
  unborn(ref: string) {
    return new CompatError('EUNBORN', `Unborn reference: ${ref}`);
  },
  shortRead(msg: string) {
    return new CompatError('ESHORTREAD', msg);
  },
  connection(msg: string) {
    return new CompatError('ECONNECTION', msg);
  },
  auth(hint?: unknown) {
    return new CompatError('EAUTH', 'Authentication failed', hint);
  },
  notFound(what: string) {
    return new CompatError('ENOTFOUND', `${what} not found`);
  },
  protocol(msg: string, details?: unknown) {
    return new CompatError('EPROTOCOL', msg, details);
  },
  unsupported(msg: string) {
    return new CompatError('EUNSUPPORTED', msg);
  },
};

// Heuristic mapper from legacy push error strings to CompatErrorCode
export function mapLegacyPushMessageToCode(msg: string): CompatErrorCode {
  const m = msg.toLowerCase()

  // Non-fast-forward and related hints
  if (
    m.includes('non-fast-forward') ||
    m.includes('non fast forward') ||
    m.includes('fetch first')
  ) return 'ENONFASTFORWARD'

  // Invalid refspec / invalid source
  if (
    m.includes('invalid refspec') ||
    m.includes('does not match any') ||
    m.includes('not a valid reference')
  ) return 'EINVALIDSPEC'

  // Unborn branch / empty repository references
  if (
    m.includes('unborn') ||
    m.includes('does not have any commits yet')
  ) return 'EUNBORN'

  // Short reads / unexpected EOF while reading pack/protocol
  if (
    m.includes('short read') ||
    m.includes('unexpected eof') ||
    m.includes('premature end of pack file')
  ) return 'ESHORTREAD'

  // Ref lock conflicts / write failures
  if (m.includes('failed to write') || m.includes('cannot lock ref')) return 'ECONFLICT'

  // Permission / protected refs / hook rejections
  if (
    m.includes('pre-receive hook declined') ||
    m.includes('hooks declined') ||
    m.includes('hook declined') ||
    m.includes('protected branch')
  ) return 'EPERM'

  // Authentication
  if (m.includes('authentication') || m.includes('auth failed') || m.includes('unauthorized')) return 'EAUTH'

  // Missing remote refs / targets
  if (m.includes('not found') || m.includes('does not exist')) return 'ENOTFOUND'

  // Network / connection-ish failures
  if (
    m.includes('connection') ||
    m.includes('network') ||
    m.includes('timed out') ||
    m.includes('timeout')
  ) return 'ECONNECTION'

  // Unsupported shallow push behavior
  if (m.includes('shallow update not allowed')) return 'EUNSUPPORTED'

  // Protocol issues
  if (m.includes('protocol')) return 'EPROTOCOL'

  return 'EINTERNAL'
}

export function mapThrownErrorToCode(e: unknown): CompatErrorCode {
  // Preserve CompatError codes when re-mapping
  if (e && typeof e === 'object') {
    const anyErr = /** @type {any} */ (e)
    if (anyErr && anyErr.name === 'CompatError' && typeof anyErr.code === 'string') {
      return /** @type {CompatErrorCode} */ (anyErr.code)
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
  if (m.includes('authentication') || m.includes('unauthorized') || m.includes('auth failed')) return 'EAUTH'
  if (m.includes('forbidden') || m.includes('permission denied') || m.includes('protected branch')) return 'EPERM'

  // Protocol-level parsing issues (pkt-line, malformed wire messages, etc)
  if (
    m.includes('pkt-line') ||
    m.includes('pkt line') ||
    m.includes('protocol error') ||
    m.includes('unexpected pkt') ||
    m.includes('malformed pkt')
  ) return 'EPROTOCOL'

  // Short read / EOF while reading pack or response body
  if (
    m.includes('short read') ||
    m.includes('unexpected eof') ||
    m.includes('premature end of pack file') ||
    m.includes('unexpected end of file')
  ) return 'ESHORTREAD'

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
  ) return 'ECONNECTION'

  return 'EINTERNAL'
}
