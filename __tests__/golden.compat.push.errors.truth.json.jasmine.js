/* eslint-env node, browser, jasmine */

const { createPushCompat } = require('../src/compat/push.js')
const truth = require('./__truth__/push-errors.json')

describe('golden: compat push errors taxonomy (truth fixtures json)', () => {
  for (const { message, code } of truth) {
    it(`${message} -> ${code}`, async () => {
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
      expect(res.updates[0]).toEqual(jasmine.objectContaining({ code }))
    })
  }
})
