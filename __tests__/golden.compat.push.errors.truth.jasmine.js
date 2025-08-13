/* eslint-env node, browser, jasmine */

const { createPushCompat } = require('../src/compat/push.js')

// Minimal truth-like samples approximating common git server outputs
const cases = [
  ['[remote rejected] main -> main (non-fast-forward) (hint: Updates were rejected because...)', 'ENONFASTFORWARD'],
  ['remote: error: GH006: Protected branch update failed for refs/heads/main. hook declined', 'EPERM'],
  ['! [rejected]  v1.2.3 -> v1.2.3 (cannot lock ref refs/tags/v1.2.3: is at abcdef0 but expected 1234567)', 'ECONFLICT'],
  ['fatal: Authentication failed for https://example.com/repo.git', 'EAUTH'],
  ['! [remote rejected] feature -> feature (shallow update not allowed)', 'EUNSUPPORTED'],
]

describe('golden: compat push errors taxonomy (truth-like samples)', () => {
  for (const [message, code] of cases) {
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
