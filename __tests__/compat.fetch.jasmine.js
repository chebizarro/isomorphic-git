/* eslint-env node, browser, jasmine */

const { createFetchCompat } = require('../src/compat/fetch.js')

describe('compat fetch (jasmine)', () => {
  it('delegates to transport and preserves FetchResult shape', async () => {
    const events = []
    const calls = []
    const transport = {
      async performFetch(opts) {
        calls.push(opts)
        opts.onProgress &&
          opts.onProgress({
            phase: 'Receiving objects',
            loaded: 1,
            total: 10,
          })
        return {
          defaultBranch: 'refs/heads/main',
          fetchHead: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
          fetchHeadDescription: "branch 'main' of https://example.com/repo.git",
          headers: { x: 'y' },
          pruned: [],
        }
      },
    }

    const { fetch } = createFetchCompat(transport)
    const res = await fetch({
      url: 'https://example.com/repo.git',
      onProgress: e => events.push(e),
    })

    expect(res.defaultBranch).toBe('refs/heads/main')
    expect(res.fetchHeadDescription).toContain("branch 'main'")
    expect(events.length).toBe(1)
    expect(calls[0].url).toBe('https://example.com/repo.git')
  })
})
