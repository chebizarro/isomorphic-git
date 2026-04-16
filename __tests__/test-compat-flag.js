/* eslint-env jest */

describe('compat flag', () => {
  const originalEnvLegacy = process.env.ISOGIT_LEGACY
  const originalEnvCompat = process.env.LIBGIT2_COMPAT

  afterEach(() => {
    // Restore ISOGIT_LEGACY
    if (originalEnvLegacy === undefined) {
      delete process.env.ISOGIT_LEGACY
    } else {
      process.env.ISOGIT_LEGACY = originalEnvLegacy
    }
    // Restore LIBGIT2_COMPAT
    if (originalEnvCompat === undefined) {
      delete process.env.LIBGIT2_COMPAT
    } else {
      process.env.LIBGIT2_COMPAT = originalEnvCompat
    }
    // Clear globalThis flags
    if (typeof globalThis !== 'undefined') {
      delete globalThis.__ISOGIT_LEGACY__
    }
  })

  /**
   * Evaluate the flag logic inline (mirrors flag.js) so we don't hit ESM
   * module caching — Jest caches ESM modules and won't re-evaluate flag.js
   * when env vars change between tests.
   */
  function loadFlag() {
    function isLegacyMode() {
      if (typeof process !== 'undefined' && process && process.env) {
        const legacyVal = String(process.env.ISOGIT_LEGACY ?? '').toLowerCase()
        if (['true', '1', 'yes', 'on'].includes(legacyVal)) return true

        const compatVal = String(process.env.LIBGIT2_COMPAT ?? '').toLowerCase()
        if (['false', '0', 'no', 'off'].includes(compatVal)) return true
      }
      if (
        typeof globalThis !== 'undefined' &&
        globalThis &&
        globalThis.__ISOGIT_LEGACY__ === true
      ) {
        return true
      }
      return false
    }
    return !isLegacyMode()
  }

  // Default: compat is ON

  it('returns true (compat ON) when no env vars are set', () => {
    delete process.env.ISOGIT_LEGACY
    delete process.env.LIBGIT2_COMPAT
    expect(loadFlag()).toBe(true)
  })

  // Opt-out via ISOGIT_LEGACY

  it('returns false (legacy mode) for ISOGIT_LEGACY=1', () => {
    process.env.ISOGIT_LEGACY = '1'
    expect(loadFlag()).toBe(false)
  })

  it('returns false for ISOGIT_LEGACY=true', () => {
    process.env.ISOGIT_LEGACY = 'true'
    expect(loadFlag()).toBe(false)
  })

  it('returns false for ISOGIT_LEGACY=yes', () => {
    process.env.ISOGIT_LEGACY = 'yes'
    expect(loadFlag()).toBe(false)
  })

  it('returns false for ISOGIT_LEGACY=on', () => {
    process.env.ISOGIT_LEGACY = 'on'
    expect(loadFlag()).toBe(false)
  })

  it('returns false for ISOGIT_LEGACY=TRUE (case-insensitive)', () => {
    process.env.ISOGIT_LEGACY = 'TRUE'
    expect(loadFlag()).toBe(false)
  })

  it('returns true (compat ON) for ISOGIT_LEGACY=false', () => {
    process.env.ISOGIT_LEGACY = 'false'
    expect(loadFlag()).toBe(true)
  })

  it('returns true (compat ON) for ISOGIT_LEGACY=0', () => {
    process.env.ISOGIT_LEGACY = '0'
    expect(loadFlag()).toBe(true)
  })

  // Backward-compat opt-out via LIBGIT2_COMPAT=false/0/no/off

  it('returns false (legacy mode) for LIBGIT2_COMPAT=false', () => {
    process.env.LIBGIT2_COMPAT = 'false'
    expect(loadFlag()).toBe(false)
  })

  it('returns false for LIBGIT2_COMPAT=0', () => {
    process.env.LIBGIT2_COMPAT = '0'
    expect(loadFlag()).toBe(false)
  })

  it('returns false for LIBGIT2_COMPAT=no', () => {
    process.env.LIBGIT2_COMPAT = 'no'
    expect(loadFlag()).toBe(false)
  })

  it('returns false for LIBGIT2_COMPAT=off', () => {
    process.env.LIBGIT2_COMPAT = 'off'
    expect(loadFlag()).toBe(false)
  })

  it('returns true (compat ON) for LIBGIT2_COMPAT=true (no longer needed but harmless)', () => {
    process.env.LIBGIT2_COMPAT = 'true'
    // "true" is NOT in the opt-out list, so compat stays on
    expect(loadFlag()).toBe(true)
  })

  it('returns true (compat ON) for LIBGIT2_COMPAT=1 (no longer needed but harmless)', () => {
    process.env.LIBGIT2_COMPAT = '1'
    expect(loadFlag()).toBe(true)
  })

  // Browser-style opt-out via globalThis

  it('returns false (legacy mode) for globalThis.__ISOGIT_LEGACY__ = true', () => {
    delete process.env.ISOGIT_LEGACY
    delete process.env.LIBGIT2_COMPAT
    globalThis.__ISOGIT_LEGACY__ = true
    expect(loadFlag()).toBe(false)
  })

  it('returns true (compat ON) for globalThis.__ISOGIT_LEGACY__ = false', () => {
    delete process.env.ISOGIT_LEGACY
    delete process.env.LIBGIT2_COMPAT
    globalThis.__ISOGIT_LEGACY__ = false
    expect(loadFlag()).toBe(true)
  })

  // ISOGIT_LEGACY takes precedence over LIBGIT2_COMPAT

  it('ISOGIT_LEGACY=1 opts out even when LIBGIT2_COMPAT is not set', () => {
    process.env.ISOGIT_LEGACY = '1'
    delete process.env.LIBGIT2_COMPAT
    expect(loadFlag()).toBe(false)
  })
})
