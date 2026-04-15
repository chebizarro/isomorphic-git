/* eslint-env jest */

import { mapLegacyPushMessageToCode } from '../src/compat/errors.js'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const truth = require('./__truth__/push-errors.json')

describe('mapLegacyPushMessageToCode', () => {
  // Validate every entry in the truth fixture directly
  for (const { message, code } of truth) {
    it(`"${message}" -> ${code}`, () => {
      expect(mapLegacyPushMessageToCode(message)).toBe(code)
    })
  }

  // Additional edge cases
  it('non fast forward (space variant)', () => {
    expect(mapLegacyPushMessageToCode('non fast forward')).toBe('ENONFASTFORWARD')
  })

  it('fetch first hint', () => {
    expect(mapLegacyPushMessageToCode('Updates rejected because... fetch first')).toBe('ENONFASTFORWARD')
  })

  it('invalid refspec', () => {
    expect(mapLegacyPushMessageToCode('invalid refspec foo:bar')).toBe('EINVALIDSPEC')
  })

  it('unborn branch', () => {
    expect(mapLegacyPushMessageToCode('unborn branch')).toBe('EUNBORN')
  })

  it('no commits yet', () => {
    expect(mapLegacyPushMessageToCode('does not have any commits yet')).toBe('EUNBORN')
  })

  it('short read', () => {
    expect(mapLegacyPushMessageToCode('short read')).toBe('ESHORTREAD')
  })

  it('unexpected eof', () => {
    expect(mapLegacyPushMessageToCode('unexpected eof')).toBe('ESHORTREAD')
  })

  it('failed to write', () => {
    expect(mapLegacyPushMessageToCode('failed to write ref')).toBe('ECONFLICT')
  })

  it('cannot lock ref', () => {
    expect(mapLegacyPushMessageToCode('cannot lock ref refs/heads/main')).toBe('ECONFLICT')
  })

  it('hooks declined', () => {
    expect(mapLegacyPushMessageToCode('hooks declined')).toBe('EPERM')
  })

  it('protected branch', () => {
    expect(mapLegacyPushMessageToCode('protected branch main')).toBe('EPERM')
  })

  it('authentication failed', () => {
    expect(mapLegacyPushMessageToCode('Authentication failed')).toBe('EAUTH')
  })

  it('auth failed', () => {
    expect(mapLegacyPushMessageToCode('auth failed')).toBe('EAUTH')
  })

  it('unauthorized', () => {
    expect(mapLegacyPushMessageToCode('unauthorized')).toBe('EAUTH')
  })

  it('credential error', () => {
    expect(mapLegacyPushMessageToCode('credential rejected')).toBe('EAUTH')
  })

  it('remote: not found', () => {
    expect(mapLegacyPushMessageToCode('remote: not found')).toBe('ENOTFOUND')
  })

  it('remote ref not found', () => {
    expect(mapLegacyPushMessageToCode('remote ref not found')).toBe('ENOTFOUND')
  })

  it('unknown ref', () => {
    expect(mapLegacyPushMessageToCode('unknown ref refs/heads/x')).toBe('ENOTFOUND')
  })

  it('no such remote ref', () => {
    expect(mapLegacyPushMessageToCode('no such remote ref')).toBe('ENOTFOUND')
  })

  it('connection reset', () => {
    expect(mapLegacyPushMessageToCode('connection reset by peer')).toBe('ECONNECTION')
  })

  it('connection refused', () => {
    expect(mapLegacyPushMessageToCode('connection refused')).toBe('ECONNECTION')
  })

  it('timed out', () => {
    expect(mapLegacyPushMessageToCode('timed out')).toBe('ECONNECTION')
  })

  it('timeout', () => {
    expect(mapLegacyPushMessageToCode('timeout')).toBe('ECONNECTION')
  })

  it('network error', () => {
    expect(mapLegacyPushMessageToCode('network error')).toBe('ECONNECTION')
  })

  it('shallow update not allowed', () => {
    expect(mapLegacyPushMessageToCode('shallow update not allowed')).toBe('EUNSUPPORTED')
  })

  it('protocol error', () => {
    expect(mapLegacyPushMessageToCode('protocol error')).toBe('EPROTOCOL')
  })

  it('unknown message -> EINTERNAL', () => {
    expect(mapLegacyPushMessageToCode('something random')).toBe('EINTERNAL')
  })
})
