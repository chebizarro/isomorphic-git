import { describe, it, expect } from 'vitest'
import { createFetchCompat } from '../src/compat/fetch'

describe('compat fetch', () => {
  it('passes shallow/deepen options and maps progress phases', async () => {
    const calls: any[] = []
    const fake = {
      async negotiate(opts: any) {
        calls.push(opts)
        // simulate phased progress
        opts.onProgress?.({ phase: 'negotiation' })
        opts.onProgress?.({ phase: 'receiving', receivedBytes: 1024 })
        return { updatedRefs: ['refs/heads/main'] }
      },
    }

    const { fetch } = createFetchCompat(fake as any)
    const events: any[] = []
    const res = await fetch({ url: 'https://example.com/repo.git', depth: 1, onProgress: e => events.push(e) })

    expect(res.updatedRefs).toEqual(['refs/heads/main'])
    expect(calls[0].depth).toBe(1)
    expect(events.map(e => e.phase)).toEqual(['negotiation', 'receiving'])
    expect(events[1].receivedBytes).toBe(1024)
  })
})
