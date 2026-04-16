import * as git from 'dimorphic-git'
import * as fs from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const { promises: fsp } = fs

describe('mergeAnalysis', () => {
  let dir

  beforeEach(async () => {
    dir = join(tmpdir(), `test-merge-analysis-${Date.now()}-${Math.random().toString(36).slice(2)}`)
    await fsp.mkdir(dir, { recursive: true })
    await git.init({ fs, dir })
  })

  afterEach(async () => {
    await fsp.rm(dir, { recursive: true, force: true }).catch(() => {})
  })

  it('returns UNBORN for an empty repo', async () => {
    const result = await git.mergeAnalysis({ fs, dir, theirs: 'main' })
    expect(result.analysis).toBe(git.MERGE_ANALYSIS.UNBORN)
  })

  it('returns UP_TO_DATE when ours == theirs', async () => {
    await fsp.writeFile(join(dir, 'a.txt'), 'hello')
    await git.add({ fs, dir, filepath: 'a.txt' })
    const oid = await git.commit({ fs, dir, message: 'init', author: { name: 'T', email: 't@t' } })

    // Create a branch at same commit
    await git.branch({ fs, dir, ref: 'feature', object: oid })

    const result = await git.mergeAnalysis({ fs, dir, theirs: 'feature' })
    expect(result.analysis).toBe(git.MERGE_ANALYSIS.UP_TO_DATE)
  })

  it('returns FASTFORWARD when theirs is ahead', async () => {
    await fsp.writeFile(join(dir, 'a.txt'), 'hello')
    await git.add({ fs, dir, filepath: 'a.txt' })
    const oid1 = await git.commit({ fs, dir, message: 'init', author: { name: 'T', email: 't@t' } })

    // Create a branch at first commit
    await git.branch({ fs, dir, ref: 'old', object: oid1 })

    // Make another commit on current branch
    await fsp.writeFile(join(dir, 'b.txt'), 'world')
    await git.add({ fs, dir, filepath: 'b.txt' })
    const oid2 = await git.commit({ fs, dir, message: 'second', author: { name: 'T', email: 't@t' } })

    // old is behind HEAD — fast-forward old to HEAD
    const result = await git.mergeAnalysis({ fs, dir, ours: 'old', theirs: 'HEAD' })
    expect(result.analysis & git.MERGE_ANALYSIS.FASTFORWARD).toBeTruthy()
  })

  it('returns NORMAL for diverged branches', async () => {
    await fsp.writeFile(join(dir, 'a.txt'), 'hello')
    await git.add({ fs, dir, filepath: 'a.txt' })
    const oid1 = await git.commit({ fs, dir, message: 'init', author: { name: 'T', email: 't@t' } })

    // Create feature branch
    await git.branch({ fs, dir, ref: 'feature', object: oid1 })

    // Commit on main
    await fsp.writeFile(join(dir, 'b.txt'), 'main change')
    await git.add({ fs, dir, filepath: 'b.txt' })
    await git.commit({ fs, dir, message: 'main commit', author: { name: 'T', email: 't@t' } })

    // Commit on feature (via ref)
    await fsp.writeFile(join(dir, 'c.txt'), 'feature change')
    await git.add({ fs, dir, filepath: 'c.txt' })
    await git.commit({
      fs, dir, message: 'feature commit',
      author: { name: 'T', email: 't@t' },
      ref: 'refs/heads/feature', parent: [oid1],
    })

    const result = await git.mergeAnalysis({ fs, dir, theirs: 'feature' })
    expect(result.analysis & git.MERGE_ANALYSIS.NORMAL).toBeTruthy()
    expect(result.analysis & git.MERGE_ANALYSIS.FASTFORWARD).toBeFalsy()
  })

  it('exports correct constants', () => {
    expect(git.MERGE_ANALYSIS.NONE).toBe(0)
    expect(git.MERGE_ANALYSIS.NORMAL).toBe(1)
    expect(git.MERGE_ANALYSIS.UP_TO_DATE).toBe(2)
    expect(git.MERGE_ANALYSIS.FASTFORWARD).toBe(4)
    expect(git.MERGE_PREFERENCE.NONE).toBe(0)
  })
})
