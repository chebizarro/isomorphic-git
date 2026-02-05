/* eslint-env node, browser, jasmine */

const { createFetchCompat } = require('../src/compat/fetch.js')

describe('golden: compat fetch validation', () => {
  it('valid depth=0 passes through', async () => {
    const calls = []
    const transport = {
      async performFetch(opts) {
        calls.push(opts)
        return { ok: true }
      },
    }

    const { fetch } = createFetchCompat(transport)
    await fetch({ url: 'https://example.com/repo.git', depth: 0 })
    expect(calls.length).toBe(1)
    expect(calls[0].depth).toBe(0)
  })

  it('invalid depth throws EINVALIDSPEC', async () => {
    const transport = {
      async performFetch() {
        throw new Error(
          'transport.performFetch should not be called for invalid inputs'
        )
      },
    }

    const { fetch } = createFetchCompat(transport)

    try {
      await fetch({
        url: 'https://example.com/repo.git',
        depth: -1,
      })
      fail('Expected fetch() to throw for invalid depth')
    } catch (e) {
      expect(e && e.name).toBe('CompatError')
      expect(e && e.code).toBe('EINVALIDSPEC')
    }
  })

  it('NaN depth throws EINVALIDSPEC', async () => {
    const transport = {
      async performFetch() {
        throw new Error(
          'transport.performFetch should not be called for invalid inputs'
        )
      },
    }

    const { fetch } = createFetchCompat(transport)

    try {
      await fetch({ url: 'https://example.com/repo.git', depth: Number.NaN })
      fail('Expected fetch() to throw for NaN depth')
    } catch (e) {
      expect(e && e.name).toBe('CompatError')
      expect(e && e.code).toBe('EINVALIDSPEC')
    }
  })

  it('Infinity depth throws EINVALIDSPEC', async () => {
    const transport = {
      async performFetch() {
        throw new Error(
          'transport.performFetch should not be called for invalid inputs'
        )
      },
    }

    const { fetch } = createFetchCompat(transport)

    try {
      await fetch({
        url: 'https://example.com/repo.git',
        depth: Number.POSITIVE_INFINITY,
      })
      fail('Expected fetch() to throw for Infinity depth')
    } catch (e) {
      expect(e && e.name).toBe('CompatError')
      expect(e && e.code).toBe('EINVALIDSPEC')
    }
  })

  it('invalid since throws EINVALIDSPEC', async () => {
    const transport = {
      async performFetch() {
        throw new Error(
          'transport.performFetch should not be called for invalid inputs'
        )
      },
    }

    const { fetch } = createFetchCompat(transport)

    try {
      await fetch({
        url: 'https://example.com/repo.git',
        since: /** @type {any} */ (123),
      })
      fail('Expected fetch() to throw for invalid since')
    } catch (e) {
      expect(e && e.name).toBe('CompatError')
      expect(e && e.code).toBe('EINVALIDSPEC')
    }
  })

  it('Invalid Date since throws EINVALIDSPEC', async () => {
    const transport = {
      async performFetch() {
        throw new Error(
          'transport.performFetch should not be called for invalid inputs'
        )
      },
    }

    const { fetch } = createFetchCompat(transport)

    try {
      await fetch({
        url: 'https://example.com/repo.git',
        since: new Date('invalid'),
      })
      fail('Expected fetch() to throw for Invalid Date')
    } catch (e) {
      expect(e && e.name).toBe('CompatError')
      expect(e && e.code).toBe('EINVALIDSPEC')
    }
  })

  it('depth + since throws EINVALIDSPEC', async () => {
    const transport = {
      async performFetch() {
        throw new Error(
          'transport.performFetch should not be called for invalid inputs'
        )
      },
    }

    const { fetch } = createFetchCompat(transport)

    try {
      await fetch({
        url: 'https://example.com/repo.git',
        depth: 1,
        since: new Date(0),
      })
      fail('Expected fetch() to throw for depth+since combination')
    } catch (e) {
      expect(e && e.name).toBe('CompatError')
      expect(e && e.code).toBe('EINVALIDSPEC')
    }
  })

  it('invalid transport throws EINVALIDSPEC', () => {
    try {
      createFetchCompat(/** @type {any} */ (null))
      fail('Expected createFetchCompat() to throw for invalid transport')
    } catch (e) {
      expect(e && e.name).toBe('CompatError')
      expect(e && e.code).toBe('EINVALIDSPEC')
    }
  })
})
