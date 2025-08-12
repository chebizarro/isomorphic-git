/* eslint-env node, browser, jasmine */

const { createPushCompat } = require('../src/compat/push.js')

describe('golden: compat push', () => {
  it('maps legacy push to {updates, rejected} and progress', async () => {
    const events = []
    const calls = []
    const transport = {
      async performPush(opts) {
        calls.push({ url: opts.url, refspecs: opts.refspecs, force: !!opts.force })
        if (opts.onProgress) {
          opts.onProgress({ writtenObjects: 1, totalObjects: 2 })
          opts.onProgress({ writtenObjects: 2, totalObjects: 2 })
        }
        return {
          updates: [
            { ref: 'refs/heads/main', ok: true },
            { ref: 'refs/tags/v1.0.0', ok: false, message: 'rejected non-fast-forward' },
          ],
          rejected: ['refs/tags/v1.0.0'],
        }
      },
    }

    const { push } = createPushCompat(/** @type {any} */ (transport))
    const result = await push({
      url: 'https://example.com/repo.git',
      refspecs: ['refs/heads/main:refs/heads/main', 'refs/tags/*:refs/tags/*'],
      force: false,
      onProgress: e => events.push(e),
    })

    expect({ result, events, calls }).toMatchInlineSnapshot(`
Object {
  "calls": Array [
    Object {
      "force": false,
      "refspecs": Array [
        "refs/heads/main:refs/heads/main",
        "refs/tags/*:refs/tags/*",
      ],
      "url": "https://example.com/repo.git",
    },
  ],
  "events": Array [
    Object {
      "totalObjects": 2,
      "writtenObjects": 1,
    },
    Object {
      "totalObjects": 2,
      "writtenObjects": 2,
    },
  ],
  "result": Object {
    "rejected": Array [
      "refs/tags/v1.0.0",
    ],
    "updates": Array [
      Object {
        "ok": true,
        "ref": "refs/heads/main",
      },
      Object {
        "message": "rejected non-fast-forward",
        "ok": false,
        "ref": "refs/tags/v1.0.0",
      },
    ],
  },
}
`)
  })
})
