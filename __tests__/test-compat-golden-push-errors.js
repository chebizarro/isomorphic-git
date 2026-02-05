/* eslint-env jest */

import { createPushCompat } from '../src/compat/push.js'

describe('golden: compat push errors taxonomy', () => {
  it('non-fast-forward maps to ENONFASTFORWARD', async () => {
    const transport = {
      async performPush() {
        return {
          updates: [
            {
              ref: 'refs/heads/main',
              ok: false,
              message: 'rejected non-fast-forward',
            },
          ],
          rejected: ['refs/heads/main'],
        }
      },
    }

    const { push } = createPushCompat(transport)
    const res = await push({
      url: 'https://example.com/repo.git',
      refspecs: [],
    })

    expect(res).toMatchInlineSnapshot(`
      {
        "rejected": [
          "refs/heads/main",
        ],
        "updates": [
          {
            "code": "ENONFASTFORWARD",
            "message": "rejected non-fast-forward",
            "ok": false,
            "ref": "refs/heads/main",
          },
        ],
      }
    `)
  })

  it('hook declined maps to EPERM', async () => {
    const transport = {
      async performPush() {
        return {
          updates: [
            {
              ref: 'refs/heads/feat',
              ok: false,
              message: 'pre-receive hook declined',
            },
          ],
          rejected: ['refs/heads/feat'],
        }
      },
    }

    const { push } = createPushCompat(transport)
    const res = await push({
      url: 'https://example.com/repo.git',
      refspecs: [],
    })

    expect(res.updates[0]).toEqual(expect.objectContaining({ code: 'EPERM' }))
  })

  it('lock ref conflict maps to ECONFLICT', async () => {
    const transport = {
      async performPush() {
        return {
          updates: [
            {
              ref: 'refs/heads/x',
              ok: false,
              message: 'cannot lock ref refs/heads/x',
            },
          ],
          rejected: ['refs/heads/x'],
        }
      },
    }

    const { push } = createPushCompat(transport)
    const res = await push({
      url: 'https://example.com/repo.git',
      refspecs: [],
    })

    expect(res.updates[0]).toEqual(
      expect.objectContaining({ code: 'ECONFLICT' })
    )
  })
})
