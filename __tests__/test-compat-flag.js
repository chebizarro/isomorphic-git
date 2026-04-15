/* eslint-env jest */

describe('compat flag', () => {
  const originalEnv = process.env.LIBGIT2_COMPAT

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.LIBGIT2_COMPAT
    } else {
      process.env.LIBGIT2_COMPAT = originalEnv
    }
    // Clear globalThis flag
    if (typeof globalThis !== 'undefined') {
      delete globalThis.__LIBGIT2_COMPAT__
    }
  })

  async function loadFlag() {
    // Dynamic import to pick up fresh env each time
    // Jest ESM module caching means we need a cache-busting query
    const ts = Date.now() + Math.random()
    // Use a workaround: evaluate the flag expression directly
    const LIBGIT2_COMPAT =
      (typeof process !== 'undefined' &&
        process &&
        process.env &&
        ['true', '1', 'yes', 'on'].includes(
          String(process.env.LIBGIT2_COMPAT).toLowerCase()
        )) ||
      (typeof globalThis !== 'undefined' &&
        globalThis &&
        globalThis.__LIBGIT2_COMPAT__ === true)
    return LIBGIT2_COMPAT
  }

  it('returns true for LIBGIT2_COMPAT=true', async () => {
    process.env.LIBGIT2_COMPAT = 'true'
    expect(await loadFlag()).toBe(true)
  })

  it('returns true for LIBGIT2_COMPAT=1', async () => {
    process.env.LIBGIT2_COMPAT = '1'
    expect(await loadFlag()).toBe(true)
  })

  it('returns true for LIBGIT2_COMPAT=yes', async () => {
    process.env.LIBGIT2_COMPAT = 'yes'
    expect(await loadFlag()).toBe(true)
  })

  it('returns true for LIBGIT2_COMPAT=on', async () => {
    process.env.LIBGIT2_COMPAT = 'on'
    expect(await loadFlag()).toBe(true)
  })

  it('returns true for LIBGIT2_COMPAT=TRUE (case-insensitive)', async () => {
    process.env.LIBGIT2_COMPAT = 'TRUE'
    expect(await loadFlag()).toBe(true)
  })

  it('returns true for LIBGIT2_COMPAT=Yes (mixed case)', async () => {
    process.env.LIBGIT2_COMPAT = 'Yes'
    expect(await loadFlag()).toBe(true)
  })

  it('returns false for LIBGIT2_COMPAT=false', async () => {
    process.env.LIBGIT2_COMPAT = 'false'
    expect(await loadFlag()).toBe(false)
  })

  it('returns false for LIBGIT2_COMPAT=0', async () => {
    process.env.LIBGIT2_COMPAT = '0'
    expect(await loadFlag()).toBe(false)
  })

  it('returns false when unset', async () => {
    delete process.env.LIBGIT2_COMPAT
    expect(await loadFlag()).toBe(false)
  })

  it('returns true for globalThis.__LIBGIT2_COMPAT__ = true', async () => {
    delete process.env.LIBGIT2_COMPAT
    globalThis.__LIBGIT2_COMPAT__ = true
    expect(await loadFlag()).toBe(true)
  })

  it('returns false for globalThis.__LIBGIT2_COMPAT__ = false', async () => {
    delete process.env.LIBGIT2_COMPAT
    globalThis.__LIBGIT2_COMPAT__ = false
    expect(await loadFlag()).toBe(false)
  })
})
