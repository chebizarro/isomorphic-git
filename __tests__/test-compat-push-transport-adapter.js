/* eslint-env jest */

// Test the push-transport adapter's legacyPushResultToCompat logic and error handling
// by mocking the _push command and FileSystem.

import { jest } from '@jest/globals'

// Mock _push before import
const mockPush = jest.fn()
jest.unstable_mockModule('../src/commands/push.js', () => ({
  _push: mockPush,
}))
jest.unstable_mockModule('../src/models/FileSystem.js', () => ({
  FileSystem: jest.fn().mockImplementation(fs => fs),
}))

// Dynamic import after mocking
const { pushTransport } = await import(
  '../src/compat/adapters/push-transport.js'
)
const { CompatError } = await import('../src/compat/errors.js')
const { GitPushError } = await import('../src/errors/GitPushError.js')

describe('compat push-transport adapter', () => {
  beforeEach(() => {
    mockPush.mockReset()
  })

  it('maps refs object to compat updates array', async () => {
    mockPush.mockResolvedValue({
      refs: {
        'refs/heads/main': { ok: true },
        'refs/heads/feat': {
          ok: false,
          error: 'rejected non-fast-forward',
        },
      },
    })

    const res = await pushTransport.performPush({
      fs: {},
      gitdir: '/tmp/.git',
      url: 'https://example.com/repo.git',
    })

    expect(res.updates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ ref: 'refs/heads/main', ok: true }),
        expect.objectContaining({
          ref: 'refs/heads/feat',
          ok: false,
          code: 'ENONFASTFORWARD',
        }),
      ])
    )
    expect(res.rejected).toEqual(['refs/heads/feat'])
  })

  it('maps ok/errors array format', async () => {
    mockPush.mockResolvedValue({
      ok: ['unpack', 'refs/heads/main'],
      errors: ['refs/heads/locked cannot lock ref'],
    })

    const res = await pushTransport.performPush({
      fs: {},
      gitdir: '/tmp/.git',
      url: 'https://example.com/repo.git',
    })

    expect(res.updates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ ref: 'refs/heads/main', ok: true }),
        expect.objectContaining({ ref: 'refs/heads/locked', ok: false }),
      ])
    )
  })

  it('converts unpack failure GitPushError to thrown CompatError', async () => {
    mockPush.mockRejectedValue(
      new GitPushError(
        'push rejected',
        { ok: false, error: 'unpack failed' }
      )
    )

    await expect(
      pushTransport.performPush({
        fs: {},
        gitdir: '/tmp/.git',
        url: 'https://example.com/repo.git',
      })
    ).rejects.toMatchObject({
      name: 'CompatError',
      code: 'EPROTOCOL',
    })
  })

  it('converts per-ref GitPushError to structured updates', async () => {
    mockPush.mockRejectedValue(
      new GitPushError('push rejected', {
        refs: {
          'refs/heads/main': {
            ok: false,
            error: 'pre-receive hook declined',
          },
        },
      })
    )

    const res = await pushTransport.performPush({
      fs: {},
      gitdir: '/tmp/.git',
      url: 'https://example.com/repo.git',
    })

    expect(res.updates[0]).toMatchObject({
      ref: 'refs/heads/main',
      ok: false,
      code: 'EPERM',
    })
  })

  it('maps network errors to CompatError', async () => {
    const netErr = new Error('connection reset by peer')
    mockPush.mockRejectedValue(netErr)

    await expect(
      pushTransport.performPush({
        fs: {},
        gitdir: '/tmp/.git',
        url: 'https://example.com/repo.git',
      })
    ).rejects.toMatchObject({
      name: 'CompatError',
      code: 'ECONNECTION',
    })
  })

  it('rethrows unknown internal errors unchanged', async () => {
    const unknownErr = new Error('something truly unexpected')
    mockPush.mockRejectedValue(unknownErr)

    await expect(
      pushTransport.performPush({
        fs: {},
        gitdir: '/tmp/.git',
        url: 'https://example.com/repo.git',
      })
    ).rejects.toBe(unknownErr)
  })

  it('forwards onProgress to _push', async () => {
    const progressEvents = []
    mockPush.mockImplementation(async (opts) => {
      opts.onProgress?.({ phase: 'writing', loaded: 1 })
      return { refs: {} }
    })

    await pushTransport.performPush({
      fs: {},
      gitdir: '/tmp/.git',
      url: 'https://example.com/repo.git',
      onProgress: e => progressEvents.push(e),
    })

    expect(progressEvents.length).toBe(1)
  })

  it('handles GitPushError with no result data', async () => {
    mockPush.mockRejectedValue(
      new GitPushError('push rejected', null)
    )

    const res = await pushTransport.performPush({
      fs: {},
      gitdir: '/tmp/.git',
      url: 'https://example.com/repo.git',
    })

    expect(res.updates).toEqual([])
    expect(res.rejected).toEqual([])
  })
})
