/* eslint-env node, browser, jasmine */

const { createPushCompat } = require('../src/compat/push.js')

describe('golden: compat push errors taxonomy (more cases)', () => {
  function runCase(message, expectedCode) {
    return (async () => {
      const transport = {
        async performPush() {
          return {
            updates: [ { ref: 'refs/heads/x', ok: false, message } ],
            rejected: ['refs/heads/x'],
          }
        },
      }
      const { push } = createPushCompat(/** @type {any} */ (transport))
      const res = await push({ url: 'https://example.com/repo.git', refspecs: [] })
      expect(res.updates[0]).toEqual(jasmine.objectContaining({ code: expectedCode }))
    })()
  }

  it('auth failure -> EAUTH', async () => {
    await runCase('Authentication failed for https://example.com', 'EAUTH')
  })

  it('not found -> ENOTFOUND', async () => {
    await runCase('remote ref not found', 'ENOTFOUND')
  })

  it('connection error -> ECONNECTION', async () => {
    await runCase('connection reset by peer', 'ECONNECTION')
  })

  it('protocol error -> EPROTOCOL', async () => {
    await runCase('protocol error: unexpected pkt-line', 'EPROTOCOL')
  })

  it('unsupported shallow update -> EUNSUPPORTED', async () => {
    await runCase('shallow update not allowed', 'EUNSUPPORTED')
  })
})
