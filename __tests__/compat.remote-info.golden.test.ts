import { describe, it, expect } from 'vitest'
import { createRemoteInfoCompat } from '../src/compat/remote-info'

describe('compat remote-info golden', () => {
  it('v2 discovery returns capabilities without refs', async () => {
    const transport = {
      async discover() {
        return {
          protocol: 'v2' as const,
          capabilities: ['agent=git/2.45', 'symref=HEAD:refs/heads/main'],
          refs: [],
        }
      },
    }
    const { getRemoteInfo2 } = createRemoteInfoCompat(transport as any)
    const info = await getRemoteInfo2('https://example.com/repo.git')
    expect(info.protocol).toBe('v2')
    expect(Object.keys(info.capabilities)).toContain('agent')
    expect(Object.keys(info.capabilities)).toContain('symref')
    expect(info.refs.length).toBe(0)
  })

  it('v1 discovery includes refs and peeled/symrefs mapped', async () => {
    const transport = {
      async discover() {
        return {
          protocol: 'v1' as const,
          capabilities: ['multi_ack', 'agent=git/2.44.0'],
          refs: [
            { name: 'HEAD', oid: '0'.repeat(40), symbolic: 'refs/heads/main' },
            { name: 'refs/heads/main', oid: 'a'.repeat(40) },
            { name: 'refs/tags/v1.0.0', oid: 'b'.repeat(40), peeled: 'c'.repeat(40) },
          ],
        }
      },
    }
    const { getRemoteInfo2 } = createRemoteInfoCompat(transport as any)
    const info = await getRemoteInfo2('https://example.com/repo.git')
    expect(info.protocol).toBe('v1')
    const head = info.head!
    expect(head.symbolic).toBe('refs/heads/main')
    const tag = info.refs.find(r => r.name === 'refs/tags/v1.0.0')!
    expect(tag.annotated).toBe(true)
    expect(tag.peeled).toBe('c'.repeat(40))
  })
})
