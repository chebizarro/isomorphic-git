/* eslint-env node, browser, jasmine */

const { createRemoteInfoCompat } = require('../src/compat/remote-info.js')

describe('compat remote-info (jasmine)', () => {
  it('v2 discovery returns capabilities without refs', async () => {
    const transport = {
      async discover(url, opts = {}) {
        return {
          protocol: 'v2',
          capabilities: ['agent=git/2.45', 'symref=HEAD:refs/heads/main'],
          refs: [],
        }
      },
    }

    const { getRemoteInfo2 } = createRemoteInfoCompat(transport)
    const info = await getRemoteInfo2('https://example.com/repo.git')

    expect(info.protocol).toBe('v2')
    expect(Object.keys(info.capabilities)).toContain('agent')
    expect(Object.keys(info.capabilities)).toContain('symref')
    expect(info.refs.length).toBe(0)
  })

  it('v1 discovery includes refs plus HEAD symref and peeled tags when present', async () => {
    const headSym = 'refs/heads/main'
    const peeled = 'c'.repeat(40)
    const transport = {
      async discover(url, opts = {}) {
        return {
          protocol: 'v1',
          capabilities: ['multi_ack', 'agent=git/2.44.0'],
          refs: [
            { name: 'HEAD', oid: '0'.repeat(40), symbolic: headSym },
            { name: 'refs/heads/main', oid: 'a'.repeat(40) },
            { name: 'refs/tags/v1.0.0', oid: 'b'.repeat(40), peeled },
          ],
        }
      },
    }

    const { getRemoteInfo2 } = createRemoteInfoCompat(transport)
    const info = await getRemoteInfo2('https://example.com/repo.git')

    expect(info.protocol).toBe('v1')
    expect(info.head.symbolic).toBe(headSym)
    const tag = info.refs.find(r => r.name === 'refs/tags/v1.0.0')
    expect(tag.annotated).toBe(true)
    expect(tag.peeled).toBe(peeled)
  })
})
