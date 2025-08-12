import { describe, it, expect } from 'vitest'
import { createPushCompat } from '../src/compat/push'

describe('compat push', () => {
  it('maps progress and returns updates', async () => {
    const calls: any[] = []
    const fake = {
      async upload(opts: any) {
        calls.push(opts)
        opts.onProgress?.({ writtenObjects: 2, totalObjects: 5 })
        return { updates: [{ ref: 'refs/heads/main', ok: true }], rejected: [] }
      },
    }

    const { push } = createPushCompat(fake as any)
    const events: any[] = []
    const res = await push({ url: 'https://example.com/repo.git', refspecs: ['main:main'], onProgress: e => events.push(e) })

    expect(res.updates[0].ref).toBe('refs/heads/main')
    expect(events[0].writtenObjects).toBe(2)
    expect(calls[0].refspecs).toEqual(['main:main'])
  })
})
