/* eslint-env jest */

import { jest } from '@jest/globals'

const mockFetch = jest.fn()
jest.unstable_mockModule('../src/commands/fetch.js', () => ({
  _fetch: mockFetch,
}))
jest.unstable_mockModule('../src/models/FileSystem.js', () => ({
  FileSystem: jest.fn().mockImplementation(fs => fs),
}))

const { fetchTransport } = await import(
  '../src/compat/adapters/fetch-transport.js'
)

describe('compat fetch-transport adapter', () => {
  beforeEach(() => {
    mockFetch.mockReset()
  })

  it('delegates to _fetch and returns result with pruned array', async () => {
    mockFetch.mockResolvedValue({
      defaultBranch: 'refs/heads/main',
      fetchHead: 'a'.repeat(40),
    })

    const res = await fetchTransport.performFetch({
      fs: {},
      gitdir: '/tmp/.git',
      url: 'https://example.com/repo.git',
      depth: 1,
    })

    expect(res.defaultBranch).toBe('refs/heads/main')
    expect(res.pruned).toEqual([])
  })

  it('preserves existing pruned array', async () => {
    mockFetch.mockResolvedValue({
      pruned: ['refs/remotes/origin/deleted'],
    })

    const res = await fetchTransport.performFetch({
      fs: {},
      gitdir: '/tmp/.git',
      url: 'https://example.com/repo.git',
      prune: true,
    })

    expect(res.pruned).toEqual(['refs/remotes/origin/deleted'])
  })

  it('normalizes depth null/undefined', async () => {
    mockFetch.mockResolvedValue({})

    await fetchTransport.performFetch({
      fs: {},
      gitdir: '/tmp/.git',
      url: 'https://example.com/repo.git',
      depth: undefined,
      since: undefined,
    })

    const call = mockFetch.mock.calls[0][0]
    expect(call.depth).toBeNull()
    expect(call.since).toBeNull()
  })

  it('forwards depth and since values', async () => {
    const since = new Date('2024-01-01')
    mockFetch.mockResolvedValue({})

    await fetchTransport.performFetch({
      fs: {},
      gitdir: '/tmp/.git',
      url: 'https://example.com/repo.git',
      depth: 3,
      since,
    })

    const call = mockFetch.mock.calls[0][0]
    expect(call.depth).toBe(3)
    expect(call.since).toBe(since)
  })

  it('defaults boolean options to false', async () => {
    mockFetch.mockResolvedValue({})

    await fetchTransport.performFetch({
      fs: {},
      gitdir: '/tmp/.git',
      url: 'https://example.com/repo.git',
    })

    const call = mockFetch.mock.calls[0][0]
    expect(call.relative).toBe(false)
    expect(call.tags).toBe(false)
    expect(call.singleBranch).toBe(false)
    expect(call.prune).toBe(false)
    expect(call.pruneTags).toBe(false)
  })

  it('forwards onProgress to _fetch', async () => {
    const events = []
    mockFetch.mockImplementation(async (opts) => {
      opts.onProgress?.({ phase: 'receiving', loaded: 1, total: 10 })
      return {}
    })

    await fetchTransport.performFetch({
      fs: {},
      gitdir: '/tmp/.git',
      url: 'https://example.com/repo.git',
      onProgress: e => events.push(e),
    })

    expect(events.length).toBe(1)
    expect(events[0].phase).toBe('receiving')
  })
})
