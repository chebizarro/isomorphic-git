import * as git from 'isomorphic-git'
import * as fs from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const { promises: fsp } = fs

describe('commit extended', () => {
  let dir

  beforeEach(async () => {
    dir = join(tmpdir(), `test-commit-ext-${Date.now()}-${Math.random().toString(36).slice(2)}`)
    await fsp.mkdir(dir, { recursive: true })
    await git.init({ fs, dir })
  })

  afterEach(async () => {
    await fsp.rm(dir, { recursive: true, force: true }).catch(() => {})
  })

  async function makeCommit(msg) {
    await fsp.writeFile(join(dir, `${msg}.txt`), msg)
    await git.add({ fs, dir, filepath: `${msg}.txt` })
    return git.commit({ fs, dir, message: msg, author: { name: 'Test', email: 'test@test.com' } })
  }

  describe('commitNthAncestor', () => {
    it('returns self for n=0', async () => {
      const oid = await makeCommit('first')
      const result = await git.commitNthAncestor({ fs, dir, oid, n: 0 })
      // n=0 means 0 generations back = self (loop doesn't execute)
      // Actually our impl iterates 0 times for n=0, returning oid
      expect(result).toBe(oid)
    })

    it('returns parent for n=1', async () => {
      const oid1 = await makeCommit('first')
      const oid2 = await makeCommit('second')
      const result = await git.commitNthAncestor({ fs, dir, oid: oid2, n: 1 })
      expect(result).toBe(oid1)
    })

    it('returns grandparent for n=2', async () => {
      const oid1 = await makeCommit('first')
      await makeCommit('second')
      const oid3 = await makeCommit('third')
      const result = await git.commitNthAncestor({ fs, dir, oid: oid3, n: 2 })
      expect(result).toBe(oid1)
    })

    it('throws for root commit with n > depth', async () => {
      const oid = await makeCommit('only')
      await expect(git.commitNthAncestor({ fs, dir, oid, n: 2 })).rejects.toThrow(/no parent/)
    })
  })

  describe('commitParent', () => {
    it('returns first parent', async () => {
      const oid1 = await makeCommit('first')
      const oid2 = await makeCommit('second')
      const result = await git.commitParent({ fs, dir, oid: oid2 })
      expect(result).toBe(oid1)
    })

    it('returns null for root commit', async () => {
      const oid = await makeCommit('only')
      const result = await git.commitParent({ fs, dir, oid })
      expect(result).toBeNull()
    })
  })

  describe('commitHeaderField', () => {
    it('extracts tree field', async () => {
      const oid = await makeCommit('test')
      const tree = await git.commitHeaderField({ fs, dir, oid, field: 'tree' })
      expect(tree).toMatch(/^[0-9a-f]{40}$/)
    })

    it('extracts author field', async () => {
      const oid = await makeCommit('test')
      const author = await git.commitHeaderField({ fs, dir, oid, field: 'author' })
      expect(author).toContain('Test')
      expect(author).toContain('test@test.com')
    })

    it('returns null for nonexistent field', async () => {
      const oid = await makeCommit('test')
      const result = await git.commitHeaderField({ fs, dir, oid, field: 'nonexistent' })
      expect(result).toBeNull()
    })

    it('returns full parsed commit when no field specified', async () => {
      const oid = await makeCommit('hello')
      const commit = await git.commitHeaderField({ fs, dir, oid })
      expect(commit.message).toContain('hello')
      expect(commit.tree).toMatch(/^[0-9a-f]{40}$/)
      expect(commit.author.name).toBe('Test')
    })
  })
})
