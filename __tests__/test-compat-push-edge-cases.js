/* eslint-env jest */

import { createPushCompat } from '../src/compat/push.js'

describe('compat push edge cases', () => {
  it('does not overwrite pre-existing error codes on updates', async () => {
    const transport = {
      async performPush() {
        return {
          updates: [
            { ref: 'refs/heads/main', ok: false, message: 'some error', code: 'ECUSTOM' },
          ],
          rejected: ['refs/heads/main'],
        }
      },
    }

    const { push } = createPushCompat(transport)
    const res = await push({ url: 'https://example.com/repo.git', refspecs: [] })
    expect(res.updates[0].code).toBe('ECUSTOM')
  })

  it('does not assign code to successful updates', async () => {
    const transport = {
      async performPush() {
        return {
          updates: [
            { ref: 'refs/heads/main', ok: true },
          ],
          rejected: [],
        }
      },
    }

    const { push } = createPushCompat(transport)
    const res = await push({ url: 'https://example.com/repo.git', refspecs: [] })
    expect(res.updates[0].code).toBeUndefined()
  })

  it('handles empty updates array', async () => {
    const transport = {
      async performPush() {
        return { updates: [], rejected: [] }
      },
    }

    const { push } = createPushCompat(transport)
    const res = await push({ url: 'https://example.com/repo.git', refspecs: [] })
    expect(res.updates).toEqual([])
    expect(res.rejected).toEqual([])
  })

  it('handles null message on failed update', async () => {
    const transport = {
      async performPush() {
        return {
          updates: [
            { ref: 'refs/heads/main', ok: false, message: null },
          ],
          rejected: ['refs/heads/main'],
        }
      },
    }

    const { push } = createPushCompat(transport)
    const res = await push({ url: 'https://example.com/repo.git', refspecs: [] })
    // No code assigned because message is falsy
    expect(res.updates[0].code).toBeUndefined()
  })

  it('strips down progress events to writtenObjects/totalObjects', async () => {
    const events = []
    const transport = {
      async performPush(opts) {
        opts.onProgress({ writtenObjects: 3, totalObjects: 10, extraField: 'ignore' })
        return { updates: [], rejected: [] }
      },
    }

    const { push } = createPushCompat(transport)
    await push({
      url: 'https://example.com/repo.git',
      refspecs: [],
      onProgress: e => events.push(e),
    })
    expect(events[0]).toEqual({ writtenObjects: 3, totalObjects: 10 })
    expect(events[0].extraField).toBeUndefined()
  })

  it('does not call onProgress if not provided', async () => {
    const transport = {
      async performPush(opts) {
        // Calling onProgress should not throw when user didn't provide it
        if (opts.onProgress) opts.onProgress({ writtenObjects: 1, totalObjects: 1 })
        return { updates: [], rejected: [] }
      },
    }

    const { push } = createPushCompat(transport)
    // Should not throw
    const res = await push({ url: 'https://example.com/repo.git', refspecs: [] })
    expect(res.updates).toEqual([])
  })
})
