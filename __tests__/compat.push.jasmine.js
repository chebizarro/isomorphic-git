/* eslint-env node, browser, jasmine */

const { createPushCompat } = require('../src/compat/push.js')

describe('compat push (jasmine)', () => {
  it('delegates to transport and returns PushResult', async () => {
    const events = []
    const calls = []
    const transport = {
      // required by PushTransport typedef though not used in compat path
      async upload() {
        throw new Error('not used')
      },
      async performPush(opts) {
        calls.push(opts)
        opts.onProgress &&
          opts.onProgress({
            phase: 'Writing objects',
            loaded: 2,
            total: 5,
          })
        return {
          updates: [{ ref: 'refs/heads/main', ok: true }],
          rejected: [],
        }
      },
    }

    const { push } = createPushCompat(transport)
    const res = await push({
      url: 'https://example.com/repo.git',
      refspecs: ['main:main'],
      onProgress: e => events.push(e),
    })

    expect(res.updates.some(u => u.ref === 'refs/heads/main' && u.ok)).toBe(true)
    expect(events.length).toBe(1)
    expect(calls[0].refspecs).toEqual(['main:main'])
  })
})
