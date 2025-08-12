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
