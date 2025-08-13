/* eslint-env node, browser, jasmine */

const { createFetchCompat } = require('../src/compat/fetch.js')

describe('golden: compat fetch matrix', () => {
  it('depth, since, singleBranch/tags/prune variants and phase ordering', async () => {
    const calls = []
    const phases = []
    const transport = {
      async performFetch(opts) {
        calls.push({
          url: opts.url,
          depth: opts.depth,
          since: opts.since instanceof Date ? 'date' : opts.since,
          singleBranch: !!opts.singleBranch,
          tags: !!opts.tags,
          prune: !!opts.prune,
        })
        if (opts.onProgress) {
          opts.onProgress({ phase: 'negotiation', loaded: 0, total: 0 })
          opts.onProgress({ phase: 'receiving', loaded: 8, total: 10 })
          opts.onProgress({ phase: 'indexing', loaded: 10, total: 10 })
        }
        return {
          defaultBranch: 'refs/heads/main',
          fetchHead: 'f'.repeat(40),
          fetchHeadDescription: "branch 'main' of https://example.com/repo.git",
          headers: { server: 'unit' },
          pruned: [],
        }
      },
    }

    const { fetch } = createFetchCompat(transport)
    const variants = [
      { depth: 1, since: new Date(0), singleBranch: true, tags: false, prune: false },
      { depth: undefined, since: undefined, singleBranch: false, tags: true, prune: true },
      { depth: 3, since: undefined, singleBranch: true, tags: true, prune: false },
    ]

    for (const v of variants) {
      phases.length = 0
      await fetch(/** @type {any} */ ({
        url: 'https://example.com/repo.git',
        depth: v.depth,
        since: v.since,
        singleBranch: v.singleBranch,
        tags: v.tags,
        prune: v.prune,
        onProgress: e => phases.push(e.phase),
      }))
      expect(phases).toEqual(['negotiation', 'receiving', 'indexing'])
    }

    expect(calls).toMatchInlineSnapshot(`
Array [
  Object {
    "depth": 1,
    "prune": false,
    "since": "date",
    "singleBranch": true,
    "tags": false,
    "url": "https://example.com/repo.git",
  },
  Object {
    "depth": undefined,
    "prune": true,
    "since": undefined,
    "singleBranch": false,
    "tags": true,
    "url": "https://example.com/repo.git",
  },
  Object {
    "depth": 3,
    "prune": false,
    "since": undefined,
    "singleBranch": true,
    "tags": true,
    "url": "https://example.com/repo.git",
  },
]
`)
  })
})
