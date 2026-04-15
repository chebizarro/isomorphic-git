/* eslint-env jest */

import { createFetchCompat } from '../src/compat/fetch.js'

describe('compat fetch phase ordering', () => {
  function makeTransport(emitPhases) {
    return {
      async performFetch(opts) {
        for (const p of emitPhases) {
          if (opts.onProgress) {
            opts.onProgress({ phase: p, loaded: 0, total: 0 })
          }
        }
        return { ok: true }
      },
    }
  }

  it('emits missing earlier phases as placeholders when skipping', async () => {
    const events = []
    const transport = makeTransport(['resolving'])
    const { fetch } = createFetchCompat(transport)
    await fetch({
      url: 'https://example.com/repo.git',
      onProgress: e => events.push(e.phase),
    })
    // Should emit negotiation, receiving, indexing as placeholders before resolving
    expect(events).toEqual(['negotiation', 'receiving', 'indexing', 'resolving'])
  })

  it('does not emit backward phase transitions', async () => {
    const events = []
    const transport = makeTransport(['indexing', 'negotiation', 'resolving'])
    const { fetch } = createFetchCompat(transport)
    await fetch({
      url: 'https://example.com/repo.git',
      onProgress: e => events.push(e.phase),
    })
    // negotiation comes before indexing in canonical order so it should be placeholder-emitted
    // Then indexing (actual), then negotiation should be dropped (backward)
    // Then resolving should be emitted
    expect(events).toEqual(['negotiation', 'receiving', 'indexing', 'resolving'])
  })

  it('normalizes git-like progress strings', async () => {
    const events = []
    const transport = makeTransport([
      'Counting objects',
      'Receiving objects',
      'Indexing objects',
      'Resolving deltas',
    ])
    const { fetch } = createFetchCompat(transport)
    await fetch({
      url: 'https://example.com/repo.git',
      onProgress: e => events.push(e.phase),
    })
    expect(events).toEqual(['negotiation', 'receiving', 'indexing', 'resolving'])
  })

  it('drops unrecognized phase strings', async () => {
    const events = []
    const transport = makeTransport([
      'random-garbage',
      'negotiation',
      'unknown-phase',
      'receiving',
    ])
    const { fetch } = createFetchCompat(transport)
    await fetch({
      url: 'https://example.com/repo.git',
      onProgress: e => events.push(e.phase),
    })
    expect(events).toEqual(['negotiation', 'receiving'])
  })

  it('handles null/undefined phase gracefully', async () => {
    const events = []
    const transport = {
      async performFetch(opts) {
        if (opts.onProgress) {
          opts.onProgress({ phase: null, loaded: 0, total: 0 })
          opts.onProgress({ phase: undefined, loaded: 0, total: 0 })
          opts.onProgress({ loaded: 5, total: 10 })
          opts.onProgress({ phase: 'negotiation', loaded: 1, total: 2 })
        }
        return { ok: true }
      },
    }
    const { fetch } = createFetchCompat(transport)
    await fetch({
      url: 'https://example.com/repo.git',
      onProgress: e => events.push(e),
    })
    // Only the negotiation event should come through
    expect(events.length).toBe(1)
    expect(events[0].phase).toBe('negotiation')
  })

  it('preserves loaded/total in progress events', async () => {
    const events = []
    const transport = makeTransport([])
    transport.performFetch = async (opts) => {
      if (opts.onProgress) {
        opts.onProgress({ phase: 'receiving', loaded: 42, total: 100 })
      }
      return { ok: true }
    }
    const { fetch } = createFetchCompat(transport)
    await fetch({
      url: 'https://example.com/repo.git',
      onProgress: e => events.push(e),
    })
    // Should have placeholder for negotiation, then receiving with original data
    expect(events[0]).toEqual({ phase: 'negotiation', loaded: 0, total: 0 })
    expect(events[1]).toMatchObject({ phase: 'receiving', loaded: 42, total: 100 })
  })

  it('no-op when onProgress is not provided', async () => {
    const transport = makeTransport(['negotiation', 'receiving'])
    const { fetch } = createFetchCompat(transport)
    // Should not throw
    const res = await fetch({ url: 'https://example.com/repo.git' })
    expect(res).toEqual({ ok: true })
  })
})
