/* eslint-env jest */

import { createRemoteInfoCompat } from '../src/compat/remote-info.js'

describe('compat remote-info edge cases', () => {
  it('v1 with no HEAD ref returns head=undefined', async () => {
    const transport = {
      async discover() {
        return {
          protocol: 'v1',
          capabilities: ['agent=git/2.44.0'],
          refs: [
            { name: 'refs/heads/main', oid: 'a'.repeat(40) },
          ],
        }
      },
    }
    const { getRemoteInfo2 } = createRemoteInfoCompat(transport)
    const info = await getRemoteInfo2('https://example.com/repo.git')
    expect(info.head).toBeUndefined()
  })

  it('v2 without symref capability returns head=undefined', async () => {
    const transport = {
      async discover() {
        return {
          protocol: 'v2',
          capabilities: ['agent=git/2.45.0', 'ls-refs'],
          refs: [],
        }
      },
    }
    const { getRemoteInfo2 } = createRemoteInfoCompat(transport)
    const info = await getRemoteInfo2('https://example.com/repo.git')
    expect(info.head).toBeUndefined()
  })

  it('v2 with symref=HEAD:refs/heads/main extracts HEAD symbolic', async () => {
    const transport = {
      async discover() {
        return {
          protocol: 'v2',
          capabilities: ['symref=HEAD:refs/heads/main'],
          refs: [],
        }
      },
    }
    const { getRemoteInfo2 } = createRemoteInfoCompat(transport)
    const info = await getRemoteInfo2('https://example.com/repo.git')
    expect(info.head).toEqual({ symbolic: 'refs/heads/main', oid: null })
  })

  it('v2 symref=HEAD: with empty target returns null symbolic', async () => {
    const transport = {
      async discover() {
        return {
          protocol: 'v2',
          capabilities: ['symref=HEAD:'],
          refs: [],
        }
      },
    }
    const { getRemoteInfo2 } = createRemoteInfoCompat(transport)
    const info = await getRemoteInfo2('https://example.com/repo.git')
    expect(info.head).toEqual({ symbolic: null, oid: null })
  })

  it('capability without value maps to true', async () => {
    const transport = {
      async discover() {
        return {
          protocol: 'v1',
          capabilities: ['multi_ack', 'thin-pack', 'agent=git/2.44.0'],
          refs: [],
        }
      },
    }
    const { getRemoteInfo2 } = createRemoteInfoCompat(transport)
    const info = await getRemoteInfo2('https://example.com/repo.git')
    expect(info.capabilities.multi_ack).toBe(true)
    expect(info.capabilities['thin-pack']).toBe(true)
    expect(info.capabilities.agent).toBe('git/2.44.0')
  })

  it('refs without peeled/symbolic get null defaults', async () => {
    const transport = {
      async discover() {
        return {
          protocol: 'v1',
          capabilities: [],
          refs: [
            { name: 'refs/heads/main', oid: 'a'.repeat(40) },
          ],
        }
      },
    }
    const { getRemoteInfo2 } = createRemoteInfoCompat(transport)
    const info = await getRemoteInfo2('https://example.com/repo.git')
    const ref = info.refs[0]
    expect(ref.peeled).toBeNull()
    expect(ref.symbolic).toBeNull()
    expect(ref.annotated).toBe(false)
  })

  it('forwards all options to transport.discover', async () => {
    const capturedOpts = []
    const transport = {
      async discover(url, opts) {
        capturedOpts.push({ url, opts })
        return { protocol: 'v1', capabilities: [], refs: [] }
      },
    }
    const { getRemoteInfo2 } = createRemoteInfoCompat(transport)
    await getRemoteInfo2('https://example.com/repo.git', {
      http: { request: 'fake' },
      headers: { 'X-Custom': 'value' },
      corsProxy: 'https://proxy.example.com',
      forPush: true,
      protocolVersion: 1,
    })
    expect(capturedOpts[0].url).toBe('https://example.com/repo.git')
    expect(capturedOpts[0].opts.http).toEqual({ request: 'fake' })
    expect(capturedOpts[0].opts.headers).toEqual({ 'X-Custom': 'value' })
    expect(capturedOpts[0].opts.corsProxy).toBe('https://proxy.example.com')
    expect(capturedOpts[0].opts.forPush).toBe(true)
    expect(capturedOpts[0].opts.protocolVersion).toBe(1)
  })
})
