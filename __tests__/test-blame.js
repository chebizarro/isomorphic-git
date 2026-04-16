import { makeFixture } from './__helpers__/FixtureFS.js'

const { blame } = await import('dimorphic-git')

describe('blame', () => {
  it('attributes all lines of a single-commit file to that commit', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-diffStat')
    const lines = await blame({ fs, dir, gitdir, ref: 'first-commit', filepath: 'a.txt' })

    expect(lines.length).toBe(5)
    // All lines should be attributed to the same commit
    const oids = new Set(lines.map(l => l.oid))
    expect(oids.size).toBe(1)

    for (const line of lines) {
      expect(line.author).toBe('Test')
      expect(line.email).toBe('test@example.com')
      expect(line.line).toBeGreaterThan(0)
      expect(line.filename).toBe('a.txt')
    }
  })

  it('attributes modified lines to the modifying commit', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-diffStat')
    // After "modify a.txt" commit: line2→modified-line2, added new-line6
    const lines = await blame({ fs, dir, gitdir, ref: 'before-rename', filepath: 'a.txt' })

    expect(lines.length).toBe(6)
    // line1, line3, line4, line5 should be from first commit
    // modified-line2, new-line6 should be from a later commit
    const firstCommitOid = lines[0].oid
    expect(lines[2].oid).toBe(firstCommitOid) // line3
    expect(lines[3].oid).toBe(firstCommitOid) // line4

    const modifyOid = lines[1].oid // modified-line2
    expect(modifyOid).not.toBe(firstCommitOid)
    expect(lines[5].oid).toBe(modifyOid) // new-line6
  })

  it('returns correct line content', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-diffStat')
    const lines = await blame({ fs, dir, gitdir, ref: 'first-commit', filepath: 'a.txt' })

    expect(lines.map(l => l.content)).toEqual([
      'line1', 'line2', 'line3', 'line4', 'line5'
    ])
  })

  it('returns 1-based line numbers', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-diffStat')
    const lines = await blame({ fs, dir, gitdir, ref: 'first-commit', filepath: 'a.txt' })

    expect(lines.map(l => l.line)).toEqual([1, 2, 3, 4, 5])
  })

  it('throws for missing files', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-diffStat')
    await expect(
      blame({ fs, dir, gitdir, ref: 'HEAD', filepath: 'nonexistent.txt' })
    ).rejects.toThrow(/not found/)
  })
})
