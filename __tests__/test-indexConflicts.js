import * as git from 'isomorphic-git'
import * as fs from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const { promises: fsp } = fs

describe('index conflict entries', () => {
  let dir

  beforeEach(async () => {
    dir = join(tmpdir(), `test-conflicts-${Date.now()}-${Math.random().toString(36).slice(2)}`)
    await fsp.mkdir(dir, { recursive: true })
    await git.init({ fs, dir })
    // Create an initial commit so we have a valid repo
    await fsp.writeFile(join(dir, 'file.txt'), 'initial')
    await git.add({ fs, dir, filepath: 'file.txt' })
    await git.commit({
      fs,
      dir,
      message: 'init',
      author: { name: 'Test', email: 'test@test.com' },
    })
  })

  afterEach(async () => {
    await fsp.rm(dir, { recursive: true, force: true }).catch(() => {})
  })

  it('indexHasConflicts returns false on clean index', async () => {
    expect(await git.indexHasConflicts({ fs, dir })).toBe(false)
  })

  it('can add and retrieve conflict entries', async () => {
    const oid1 = '1111111111111111111111111111111111111111'
    const oid2 = '2222222222222222222222222222222222222222'
    const oid3 = '3333333333333333333333333333333333333333'

    await git.indexConflictAdd({
      fs,
      dir,
      filepath: 'conflict.txt',
      ancestor: { oid: oid1, mode: 0o100644 },
      ours: { oid: oid2, mode: 0o100644 },
      theirs: { oid: oid3, mode: 0o100644 },
    })

    expect(await git.indexHasConflicts({ fs, dir })).toBe(true)

    const conflict = await git.indexConflictGet({ fs, dir, filepath: 'conflict.txt' })
    expect(conflict).not.toBeNull()
    expect(conflict.ancestor.oid).toBe(oid1)
    expect(conflict.ours.oid).toBe(oid2)
    expect(conflict.theirs.oid).toBe(oid3)
  })

  it('can iterate all conflicts', async () => {
    const oid1 = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
    const oid2 = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'

    await git.indexConflictAdd({
      fs,
      dir,
      filepath: 'a.txt',
      ours: { oid: oid1, mode: 0o100644 },
      theirs: { oid: oid2, mode: 0o100644 },
    })

    await git.indexConflictAdd({
      fs,
      dir,
      filepath: 'b.txt',
      ancestor: { oid: oid1, mode: 0o100644 },
      theirs: { oid: oid2, mode: 0o100644 },
    })

    const conflicts = await git.indexConflictIterator({ fs, dir })
    expect(conflicts.length).toBe(2)
    expect(conflicts.map(c => c.filepath).sort()).toEqual(['a.txt', 'b.txt'])
  })

  it('can remove a specific conflict', async () => {
    const oid1 = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
    const oid2 = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'

    await git.indexConflictAdd({
      fs,
      dir,
      filepath: 'conflict.txt',
      ours: { oid: oid1, mode: 0o100644 },
      theirs: { oid: oid2, mode: 0o100644 },
    })

    expect(await git.indexHasConflicts({ fs, dir })).toBe(true)

    await git.indexConflictRemove({ fs, dir, filepath: 'conflict.txt' })
    expect(await git.indexHasConflicts({ fs, dir })).toBe(false)
  })

  it('indexConflictCleanup removes all conflicts', async () => {
    const oid = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'

    await git.indexConflictAdd({
      fs,
      dir,
      filepath: 'a.txt',
      ours: { oid, mode: 0o100644 },
      theirs: { oid, mode: 0o100644 },
    })
    await git.indexConflictAdd({
      fs,
      dir,
      filepath: 'b.txt',
      ours: { oid, mode: 0o100644 },
      theirs: { oid, mode: 0o100644 },
    })

    expect(await git.indexHasConflicts({ fs, dir })).toBe(true)
    await git.indexConflictCleanup({ fs, dir })
    expect(await git.indexHasConflicts({ fs, dir })).toBe(false)
  })

  it('indexConflictGet returns null for non-conflict path', async () => {
    const result = await git.indexConflictGet({ fs, dir, filepath: 'nonexistent.txt' })
    expect(result).toBeNull()
  })
})
