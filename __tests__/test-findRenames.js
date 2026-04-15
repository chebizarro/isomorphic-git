import { makeFixture } from './__helpers__/FixtureFS.js'

const { diffTrees, findRenames, DELTA } = await import('isomorphic-git')

describe('findRenames', () => {
  it('detects exact renames (same OID)', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-diffStat')
    // before-rename → after-rename: src/main.js → src/app.js (exact rename, same content)
    const deltas = await diffTrees({ fs, dir, gitdir, oldRef: 'before-rename', newRef: 'after-rename' })
    const result = await findRenames({ fs, dir, gitdir, deltas })

    const renames = result.filter(d => d.status === DELTA.RENAMED)
    expect(renames.length).toBe(1)
    expect(renames[0].similarity).toBe(100)
    expect(renames[0].oldFile.path).toBe('src/main.js')
    expect(renames[0].newFile.path).toBe('src/app.js')
  })

  it('detects similar renames above threshold', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-diffStat')
    // before-rename → after-similar-rename: src/main.js deleted, src/renamed.js added (51% similar)
    const deltas = await diffTrees({ fs, dir, gitdir, oldRef: 'before-rename', newRef: 'after-similar-rename' })

    // Without rename detection, should have a delete and an add
    expect(deltas.some(d => d.status === DELTA.DELETED)).toBe(true)
    expect(deltas.some(d => d.status === DELTA.ADDED)).toBe(true)

    const result = await findRenames({ fs, dir, gitdir, deltas, threshold: 50 })

    const renames = result.filter(d => d.status === DELTA.RENAMED)
    expect(renames.length).toBe(1)
    expect(renames[0].similarity).toBeGreaterThanOrEqual(50)
    expect(renames[0].oldFile.path).toBe('src/main.js')
    expect(renames[0].newFile.path).toBe('src/renamed.js')
  })

  it('does not detect renames below threshold', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-diffStat')
    const deltas = await diffTrees({ fs, dir, gitdir, oldRef: 'before-rename', newRef: 'after-similar-rename' })
    // Very high threshold — should not match the similar rename
    const result = await findRenames({ fs, dir, gitdir, deltas, threshold: 99 })

    const renames = result.filter(d => d.status === DELTA.RENAMED)
    expect(renames.length).toBe(0)
    // Should still have the original delete + add
    expect(result.some(d => d.status === DELTA.DELETED)).toBe(true)
    expect(result.some(d => d.status === DELTA.ADDED)).toBe(true)
  })

  it('returns unchanged deltas when no renames exist', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-diffStat')
    // HEAD~1 → HEAD on master modifies a.txt — no rename
    const deltas = await diffTrees({ fs, dir, gitdir, oldRef: 'HEAD~1', newRef: 'HEAD' })
    const result = await findRenames({ fs, dir, gitdir, deltas })

    const renames = result.filter(d => d.status === DELTA.RENAMED || d.status === DELTA.COPIED)
    expect(renames.length).toBe(0)
  })

  it('handles empty deltas array', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-diffStat')
    const result = await findRenames({ fs, dir, gitdir, deltas: [] })
    expect(result).toEqual([])
  })
})
