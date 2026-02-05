/* eslint-env jest */

import { createFetchCompat } from '../src/compat/fetch.js'

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

    await expect(
      fetch({
        url: 'https://example.com/repo.git',
        depth: -1,
      })
    ).rejects.toMatchObject({ name: 'CompatError', code: 'EINVALIDSPEC' })
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

    await expect(
      fetch({ url: 'https://example.com/repo.git', depth: Number.NaN })
    ).rejects.toMatchObject({ name: 'CompatError', code: 'EINVALIDSPEC' })
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

    await expect(
      fetch({
        url: 'https://example.com/repo.git',
        depth: Number.POSITIVE_INFINITY,
      })
    ).rejects.toMatchObject({ name: 'CompatError', code: 'EINVALIDSPEC' })
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

    await expect(
      fetch({
        url: 'https://example.com/repo.git',
        since: 123,
      })
    ).rejects.toMatchObject({ name: 'CompatError', code: 'EINVALIDSPEC' })
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

    await expect(
      fetch({
        url: 'https://example.com/repo.git',
        since: new Date('invalid'),
      })
    ).rejects.toMatchObject({ name: 'CompatError', code: 'EINVALIDSPEC' })
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

    await expect(
      fetch({
        url: 'https://example.com/repo.git',
        depth: 1,
        since: new Date(0),
      })
    ).rejects.toMatchObject({ name: 'CompatError', code: 'EINVALIDSPEC' })
  })

  it('invalid transport throws EINVALIDSPEC', () => {
    expect(() => createFetchCompat(null)).toThrow(
      expect.objectContaining({ name: 'CompatError', code: 'EINVALIDSPEC' })
    )
  })
})
