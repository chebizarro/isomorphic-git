import { describe, it, expect } from 'vitest'
import { createRemoteInfoCompat } from '../src/compat/remote-info'

// Simple fake transport for unit testing the parser/sems.
const fakeTransport = {
  async discover() {
    return {
      protocol: 'v2' as const,
      capabilities: ['symref=HEAD:refs/heads/main', 'agent=isomorphic-git-compat'],
      refs: [
        { name: 'HEAD', oid: '0000000000000000000000000000000000000000', symbolic: 'refs/heads/main' },
        { name: 'refs/heads/main', oid: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' },
        { name: 'refs/tags/v1.0.0', oid: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', peeled: 'cccccccccccccccccccccccccccccccccccccccc' },
      ],
    }
  },
}

describe('compat getRemoteInfo2', () => {
  it('parses capabilities and HEAD symref', async () => {
    const { getRemoteInfo2 } = createRemoteInfoCompat(fakeTransport as any)
    const info = await getRemoteInfo2('https://example.com/repo.git')
    expect(info.protocol).toBe('v2')
    expect(info.capabilities.symref).toBe('HEAD:refs/heads/main')
    expect(info.head?.symbolic).toBe('refs/heads/main')
    const tag = info.refs.find(r => r.name === 'refs/tags/v1.0.0')
    expect(tag?.annotated).toBe(true)
    expect(tag?.peeled).toBe('cccccccccccccccccccccccccccccccccccccccc')
  })
})
