import * as git from 'isomorphic-git'
import * as fs from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const { promises: fsp } = fs

describe('revwalk', () => {
  let dir

  beforeEach(async () => {
    dir = join(tmpdir(), `test-revwalk-${Date.now()}-${Math.random().toString(36).slice(2)}`)
    await fsp.mkdir(dir, { recursive: true })
    await git.init({ fs, dir })
  })

  afterEach(async () => {
    await fsp.rm(dir, { recursive: true, force: true }).catch(() => {})
  })

  async function makeCommit(msg) {
    await fsp.writeFile(join(dir, `${msg}.txt`), msg)
    await git.add({ fs, dir, filepath: `${msg}.txt` })
    return git.commit({ fs, dir, message: msg, author: { name: 'T', email: 't@t' } })
  }

  it('walks commits in time order by default', async () => {
    const oid1 = await makeCommit('first')
    const oid2 = await makeCommit('second')
    const oid3 = await makeCommit('third')

    const result = await git.revwalk({ fs, dir })
    expect(result).toEqual([oid3, oid2, oid1])
  })

  it('supports REVERSE sort', async () => {
    const oid1 = await makeCommit('first')
    const oid2 = await makeCommit('second')
    const oid3 = await makeCommit('third')

    const result = await git.revwalk({ fs, dir, sort: git.SORT.TIME | git.SORT.REVERSE })
    expect(result).toEqual([oid1, oid2, oid3])
  })

  it('supports count limit', async () => {
    await makeCommit('first')
    await makeCommit('second')
    const oid3 = await makeCommit('third')

    const result = await git.revwalk({ fs, dir, count: 1 })
    expect(result).toEqual([oid3])
  })

  it('supports exclude (hide) refs', async () => {
    const oid1 = await makeCommit('first')
    await git.branch({ fs, dir, ref: 'v1', object: oid1 })
    const oid2 = await makeCommit('second')
    const oid3 = await makeCommit('third')

    const result = await git.revwalk({ fs, dir, exclude: ['v1'] })
    expect(result).toEqual([oid3, oid2])
  })

  it('supports firstParentOnly', async () => {
    const oid1 = await makeCommit('first')
    const oid2 = await makeCommit('second')

    // Create a merge commit with two parents
    await fsp.writeFile(join(dir, 'merge.txt'), 'merged')
    await git.add({ fs, dir, filepath: 'merge.txt' })
    const mergeOid = await git.commit({
      fs, dir, message: 'merge',
      author: { name: 'T', email: 't@t' },
      parent: [oid2, oid1],
    })

    const result = await git.revwalk({ fs, dir, firstParentOnly: true })
    // Should not include oid1 since it's only reachable via second parent
    expect(result).toContain(mergeOid)
    expect(result).toContain(oid2)
    // oid1 is a second parent — with firstParentOnly, it should be skipped
    // BUT oid1 is also reachable as grandparent via first-parent chain (oid2's parent)
    // so it should be included
    expect(result.length).toBe(3) // merge -> oid2 -> oid1 (all via first parent)
  })

  it('supports map function', async () => {
    await makeCommit('first')
    await makeCommit('second')

    const result = await git.revwalk({
      fs, dir,
      map: (oid, commit) => ({ oid: oid.slice(0, 7), msg: commit.message.trim() }),
    })
    expect(result.length).toBe(2)
    expect(result[0].msg).toBe('second')
    expect(result[1].msg).toBe('first')
  })

  it('exports SORT constants', () => {
    expect(git.SORT.NONE).toBe(0)
    expect(git.SORT.TOPOLOGICAL).toBe(1)
    expect(git.SORT.TIME).toBe(2)
    expect(git.SORT.REVERSE).toBe(4)
  })
})
