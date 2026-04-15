/* eslint-env jest */

import { CompatError } from '../src/compat/errors.js'

describe('CompatError class', () => {
  it('is an instance of Error', () => {
    const err = new CompatError('EAUTH', 'auth failed')
    expect(err).toBeInstanceOf(Error)
  })

  it('has name "CompatError"', () => {
    const err = new CompatError('EINTERNAL', 'something broke')
    expect(err.name).toBe('CompatError')
  })

  it('carries code and message', () => {
    const err = new CompatError('ENONFASTFORWARD', 'rejected')
    expect(err.code).toBe('ENONFASTFORWARD')
    expect(err.message).toBe('rejected')
  })

  it('carries optional details', () => {
    const details = { ref: 'refs/heads/main' }
    const err = new CompatError('ECONFLICT', 'cannot lock', details)
    expect(err.details).toBe(details)
  })

  it('details is undefined when not provided', () => {
    const err = new CompatError('EPROTOCOL', 'bad response')
    expect(err.details).toBeUndefined()
  })
})
