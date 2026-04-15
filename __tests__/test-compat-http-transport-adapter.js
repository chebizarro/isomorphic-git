/* eslint-env jest */

import { jest } from '@jest/globals'

// Mock GitRemoteManager
const mockDiscoverResult = {}
jest.unstable_mockModule('../src/managers/GitRemoteManager.js', () => ({
  GitRemoteManager: {
    getRemoteHelperFor: jest.fn().mockReturnValue({
      discover: jest.fn().mockImplementation(async () => mockDiscoverResult),
    }),
  },
}))

const { httpTransport } = await import(
  '../src/compat/adapters/http-transport.js'
)
const { GitRemoteManager } = await import(
  '../src/managers/GitRemoteManager.js'
)

describe('compat http-transport adapter', () => {
  beforeEach(() => {
    // Reset the discover result to a default
    Object.assign(mockDiscoverResult, {
      protocolVersion: 2,
      capabilities2: { agent: 'git/2.45.0', 'ls-refs': true, symref: 'HEAD:refs/heads/main' },
      refs: undefined,
      symrefs: undefined,
      peeled: undefined,
    })
  })

  it('maps v2 discovery to compat shape', async () => {
    const result = await httpTransport.discover('https://example.com/repo.git')
    expect(result.protocol).toBe('v2')
    expect(result.capabilities).toEqual(
      expect.arrayContaining([
        'agent=git/2.45.0',
        'ls-refs',
        'symref=HEAD:refs/heads/main',
      ])
    )
    expect(result.refs).toEqual([])
  })

  it('maps v1 discovery with refs, symrefs, peeled', async () => {
    Object.assign(mockDiscoverResult, {
      protocolVersion: 1,
      capabilities2: undefined,
      capabilities: new Set(['multi_ack', 'agent=git/2.44.0']),
      refs: new Map([
        ['HEAD', '0'.repeat(40)],
        ['refs/heads/main', 'a'.repeat(40)],
        ['refs/tags/v1.0.0', 'b'.repeat(40)],
      ]),
      symrefs: new Map([['HEAD', 'refs/heads/main']]),
      peeled: new Map([['refs/tags/v1.0.0', 'c'.repeat(40)]]),
    })

    const result = await httpTransport.discover('https://example.com/repo.git')
    expect(result.protocol).toBe('v1')

    const headRef = result.refs.find(r => r.name === 'HEAD')
    expect(headRef.symbolic).toBe('refs/heads/main')

    const tagRef = result.refs.find(r => r.name === 'refs/tags/v1.0.0')
    expect(tagRef.peeled).toBe('c'.repeat(40))
  })

  it('handles v1 with no symrefs or peeled', async () => {
    Object.assign(mockDiscoverResult, {
      protocolVersion: 1,
      capabilities2: undefined,
      capabilities: new Set(['agent=git/2.44.0']),
      refs: new Map([
        ['refs/heads/main', 'a'.repeat(40)],
      ]),
      symrefs: undefined,
      peeled: undefined,
    })

    const result = await httpTransport.discover('https://example.com/repo.git')
    expect(result.protocol).toBe('v1')
    expect(result.refs.length).toBe(1)
    expect(result.refs[0].symbolic).toBeUndefined()
    expect(result.refs[0].peeled).toBeUndefined()
  })

  it('passes forPush as git-receive-pack service', async () => {
    await httpTransport.discover('https://example.com/repo.git', { forPush: true })

    const helper = GitRemoteManager.getRemoteHelperFor.mock.results.at(-1).value
    const call = helper.discover.mock.calls.at(-1)[0]
    expect(call.service).toBe('git-receive-pack')
  })

  it('defaults to git-upload-pack service', async () => {
    await httpTransport.discover('https://example.com/repo.git')

    const helper = GitRemoteManager.getRemoteHelperFor.mock.results.at(-1).value
    const call = helper.discover.mock.calls.at(-1)[0]
    expect(call.service).toBe('git-upload-pack')
  })
})
