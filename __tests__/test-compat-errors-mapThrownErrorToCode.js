/* eslint-env jest */

import { mapThrownErrorToCode, CompatError } from '../src/compat/errors.js'

describe('mapThrownErrorToCode', () => {
  it('preserves CompatError codes', () => {
    const err = new CompatError('EAUTH', 'auth failed')
    expect(mapThrownErrorToCode(err)).toBe('EAUTH')
  })

  it('maps HttpError 401 -> EAUTH', () => {
    const err = new Error('HTTP Error')
    err.statusCode = 401
    expect(mapThrownErrorToCode(err)).toBe('EAUTH')
  })

  it('maps HttpError 403 -> EPERM', () => {
    const err = new Error('Forbidden')
    err.statusCode = 403
    expect(mapThrownErrorToCode(err)).toBe('EPERM')
  })

  it('maps SmartHttpError -> EPROTOCOL', () => {
    const err = new Error('something wrong')
    err.name = 'SmartHttpError'
    expect(mapThrownErrorToCode(err)).toBe('EPROTOCOL')
  })

  it('maps authentication message -> EAUTH', () => {
    expect(mapThrownErrorToCode(new Error('Authentication required'))).toBe('EAUTH')
    expect(mapThrownErrorToCode(new Error('unauthorized access'))).toBe('EAUTH')
    expect(mapThrownErrorToCode(new Error('auth failed for repo'))).toBe('EAUTH')
  })

  it('maps forbidden/permission -> EPERM', () => {
    expect(mapThrownErrorToCode(new Error('forbidden'))).toBe('EPERM')
    expect(mapThrownErrorToCode(new Error('permission denied'))).toBe('EPERM')
    expect(mapThrownErrorToCode(new Error('protected branch'))).toBe('EPERM')
  })

  it('maps pkt-line / protocol errors -> EPROTOCOL', () => {
    expect(mapThrownErrorToCode(new Error('invalid pkt-line length'))).toBe('EPROTOCOL')
    expect(mapThrownErrorToCode(new Error('protocol error: bad response'))).toBe('EPROTOCOL')
    expect(mapThrownErrorToCode(new Error('unexpected pkt received'))).toBe('EPROTOCOL')
    expect(mapThrownErrorToCode(new Error('malformed pkt data'))).toBe('EPROTOCOL')
  })

  it('maps short read / EOF -> ESHORTREAD', () => {
    expect(mapThrownErrorToCode(new Error('short read while indexing'))).toBe('ESHORTREAD')
    expect(mapThrownErrorToCode(new Error('unexpected EOF'))).toBe('ESHORTREAD')
    expect(mapThrownErrorToCode(new Error('premature end of pack file'))).toBe('ESHORTREAD')
    expect(mapThrownErrorToCode(new Error('unexpected end of file'))).toBe('ESHORTREAD')
  })

  it('maps network / connection -> ECONNECTION', () => {
    expect(mapThrownErrorToCode(new Error('failed to fetch'))).toBe('ECONNECTION')
    expect(mapThrownErrorToCode(new Error('fetch failed'))).toBe('ECONNECTION')
    expect(mapThrownErrorToCode(new Error('network error'))).toBe('ECONNECTION')
    expect(mapThrownErrorToCode(new Error('socket hang up'))).toBe('ECONNECTION')
    expect(mapThrownErrorToCode(new Error('connection reset by peer'))).toBe('ECONNECTION')
    expect(mapThrownErrorToCode(new Error('operation timed out'))).toBe('ECONNECTION')
    expect(mapThrownErrorToCode(new Error('ECONNRESET'))).toBe('ECONNECTION')
    expect(mapThrownErrorToCode(new Error('ETIMEDOUT'))).toBe('ECONNECTION')
    expect(mapThrownErrorToCode(new Error('getaddrinfo ENOTFOUND'))).toBe('ECONNECTION')
    expect(mapThrownErrorToCode(new Error('getaddrinfo EAI_AGAIN'))).toBe('ECONNECTION')
  })

  it('returns EINTERNAL for unknown errors', () => {
    expect(mapThrownErrorToCode(new Error('something unexpected'))).toBe('EINTERNAL')
    expect(mapThrownErrorToCode('string error')).toBe('EINTERNAL')
    expect(mapThrownErrorToCode(null)).toBe('EINTERNAL')
    expect(mapThrownErrorToCode(undefined)).toBe('EINTERNAL')
  })
})
