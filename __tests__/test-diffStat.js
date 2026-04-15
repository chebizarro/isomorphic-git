import { makeFixture } from './__helpers__/FixtureFS.js'

const { diffStat } = await import('isomorphic-git')
const { fs: _fs } = await import('fs')

describe('diffStat', () => {
  it('returns stat for modified files', async () => {
    // Use a fixture with multiple commits
    const { fs, dir, gitdir } = await makeFixture('test-diffStat')
    const result = await diffStat({ fs, dir, gitdir, oldRef: 'HEAD~1', newRef: 'HEAD' })

    expect(result.filesChanged).toBeGreaterThan(0)
    expect(typeof result.totalInsertions).toBe('number')
    expect(typeof result.totalDeletions).toBe('number')
    expect(Array.isArray(result.files)).toBe(true)

    for (const file of result.files) {
      expect(file).toHaveProperty('path')
      expect(file).toHaveProperty('insertions')
      expect(file).toHaveProperty('deletions')
      expect(file).toHaveProperty('binary')
    }
  })

  it('returns empty for identical refs', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-diffStat')
    const result = await diffStat({ fs, dir, gitdir, oldRef: 'HEAD', newRef: 'HEAD' })

    expect(result.filesChanged).toBe(0)
    expect(result.totalInsertions).toBe(0)
    expect(result.totalDeletions).toBe(0)
    expect(result.files).toEqual([])
  })
})
