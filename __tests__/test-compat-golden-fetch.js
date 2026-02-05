/* eslint-env jest */

import { createFetchCompat } from '../src/compat/fetch.js'

describe('golden: compat fetch', () => {
  it('golden shape and progress mapping', async () => {
    const events = []
    const calls = []
    const transport = {
      async performFetch(opts) {
        calls.push({
          url: opts.url,
          depth: opts.depth,
          since: opts.since instanceof Date ? 'date' : opts.since,
          singleBranch: !!opts.singleBranch,
          tags: !!opts.tags,
        })
        if (opts.onProgress) {
          opts.onProgress({ phase: 'negotiation', loaded: 0, total: 0 })
          opts.onProgress({ phase: 'receiving', loaded: 123, total: 456 })
          opts.onProgress({ phase: 'indexing', loaded: 2, total: 5 })
        }
        return {
          defaultBranch: 'refs/heads/main',
          fetchHead: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
          fetchHeadDescription: "branch 'main' of https://example.com/repo.git",
          headers: { server: 'unit' },
          pruned: [],
        }
      },
    }

    const { fetch } = createFetchCompat(transport)
    const res = await fetch({
      url: 'https://example.com/repo.git',
      depth: 1,
      onProgress: e => events.push(e),
      singleBranch: true,
      tags: false,
    })

    expect({ res, events, calls }).toMatchInlineSnapshot(`
      {
        "calls": [
          {
            "depth": 1,
            "since": null,
            "singleBranch": true,
            "tags": false,
            "url": "https://example.com/repo.git",
          },
        ],
        "events": [
          {
            "loaded": 0,
            "phase": "negotiation",
            "total": 0,
          },
          {
            "loaded": 123,
            "phase": "receiving",
            "total": 456,
          },
          {
            "loaded": 2,
            "phase": "indexing",
            "total": 5,
          },
        ],
        "res": {
          "defaultBranch": "refs/heads/main",
          "fetchHead": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          "fetchHeadDescription": "branch 'main' of https://example.com/repo.git",
          "headers": {
            "server": "unit",
          },
          "pruned": [],
        },
      }
    `)
  })
})
