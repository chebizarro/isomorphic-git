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
    return new CompatError('ENONFASTFORWARD', `Non-fast-forward update rejected for ${ref}`);
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
