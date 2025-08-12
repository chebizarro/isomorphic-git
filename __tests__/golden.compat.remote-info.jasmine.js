/* eslint-env node, browser, jasmine */

const { createRemoteInfoCompat } = require('../src/compat/remote-info.js')

describe('golden: compat remote-info', () => {
  it('v2 discovery golden shape', async () => {
    const transport = {
      async discover(url, opts = {}) {
        return {
          protocol: 'v2',
          capabilities: [
            'agent=git/2.45.0',
            'ls-refs',
            'fetch=shallow',
            'symref=HEAD:refs/heads/main',
          ],
          refs: [],
        }
      },
    }
    const { getRemoteInfo2 } = createRemoteInfoCompat(/** @type {any} */ (transport))
    const info = await getRemoteInfo2('https://example.com/repo.git')
    expect(info).toMatchInlineSnapshot(`
Object {
  "capabilities": Object {
    "agent": "git/2.45.0",
    "fetch": "shallow",
    "ls-refs": true,
    "symref": "HEAD:refs/heads/main",
  },
  "head": undefined,
  "protocol": "v2",
  "refs": Array [],
}
`)
  })

  it('v1 discovery with HEAD and peeled tag golden shape', async () => {
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
    const { getRemoteInfo2 } = createRemoteInfoCompat(/** @type {any} */ (transport))
    const info = await getRemoteInfo2('https://example.com/repo.git')
    expect(info).toMatchInlineSnapshot(`
Object {
  "capabilities": Object {
    "agent": "git/2.44.0",
    "multi_ack": true,
  },
  "head": Object {
    "oid": "0000000000000000000000000000000000000000",
    "symbolic": "refs/heads/main",
  },
  "protocol": "v1",
  "refs": Array [
    Object {
      "annotated": false,
      "name": "HEAD",
      "oid": "0000000000000000000000000000000000000000",
      "peeled": null,
      "symbolic": "refs/heads/main",
      "target": null,
    },
    Object {
      "annotated": false,
      "name": "refs/heads/main",
      "oid": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      "peeled": null,
      "symbolic": null,
      "target": null,
    },
    Object {
      "annotated": true,
      "name": "refs/tags/v1.0.0",
      "oid": "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      "peeled": "cccccccccccccccccccccccccccccccccccccccc",
      "symbolic": null,
      "target": "cccccccccccccccccccccccccccccccccccccccc",
    },
  ],
}
`)
  })
})
