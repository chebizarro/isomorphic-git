// Type declarations for src/compat/errors.js
// Authoritative implementation is errors.js — keep this in sync.

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
  constructor(code: CompatErrorCode, message: string, details?: unknown);
}

export function mapLegacyPushMessageToCode(msg: string): CompatErrorCode;
export function mapThrownErrorToCode(e: unknown): CompatErrorCode;
