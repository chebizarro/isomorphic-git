import * as git from 'isomorphic-git'
import * as fs from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const { promises: fsp } = fs

describe('branch extended', () => {
  let dir

  beforeEach(async () => {
    dir = join(tmpdir(), `test-branch-ext-${Date.now()}-${Math.random().toString(36).slice(2)}`)
    await fsp.mkdir(dir, { recursive: true })
    await git.init({ fs, dir })
    await fsp.writeFile(join(dir, 'a.txt'), 'hello')
    await git.add({ fs, dir, filepath: 'a.txt' })
    await git.commit({ fs, dir, message: 'init', author: { name: 'T', email: 't@t' } })
  })

  afterEach(async () => {
    await fsp.rm(dir, { recursive: true, force: true }).catch(() => {})
  })

  describe('branchUpstream', () => {
    it('returns null when no upstream configured', async () => {
      const result = await git.branchUpstream({ fs, dir, ref: 'main' })
      expect(result).toBeNull()
    })

    it('returns upstream info when configured', async () => {
      await git.setBranchUpstream({
        fs, dir, ref: 'main',
        remote: 'origin',
        merge: 'refs/heads/main',
      })
      const result = await git.branchUpstream({ fs, dir, ref: 'main' })
      expect(result).toEqual({
        remote: 'origin',
        merge: 'refs/heads/main',
        ref: 'refs/remotes/origin/main',
      })
    })
  })

  describe('setBranchUpstream / unsetBranchUpstream', () => {
    it('sets and unsets upstream', async () => {
      await git.setBranchUpstream({
        fs, dir, ref: 'main',
        remote: 'origin',
        merge: 'refs/heads/main',
      })
      expect(await git.branchUpstream({ fs, dir, ref: 'main' })).not.toBeNull()

      await git.unsetBranchUpstream({ fs, dir, ref: 'main' })
      expect(await git.branchUpstream({ fs, dir, ref: 'main' })).toBeNull()
    })
  })

  describe('branchIsHead', () => {
    it('returns true for current branch', async () => {
      const currentBranch = await git.currentBranch({ fs, dir })
      expect(await git.branchIsHead({ fs, dir, ref: currentBranch })).toBe(true)
    })

    it('returns false for non-head branch', async () => {
      await git.branch({ fs, dir, ref: 'feature' })
      expect(await git.branchIsHead({ fs, dir, ref: 'feature' })).toBe(false)
    })
  })

  describe('branchNameIsValid', () => {
    it('accepts valid names', () => {
      expect(git.branchNameIsValid('main')).toBe(true)
      expect(git.branchNameIsValid('feature/test')).toBe(true)
      expect(git.branchNameIsValid('release-1.0')).toBe(true)
    })

    it('rejects invalid names', () => {
      expect(git.branchNameIsValid('')).toBe(false)
      expect(git.branchNameIsValid('.hidden')).toBe(false)
      expect(git.branchNameIsValid('name..double')).toBe(false)
      expect(git.branchNameIsValid('name.lock')).toBe(false)
      expect(git.branchNameIsValid('has space')).toBe(false)
      expect(git.branchNameIsValid('has~tilde')).toBe(false)
      expect(git.branchNameIsValid('has^caret')).toBe(false)
      expect(git.branchNameIsValid('has:colon')).toBe(false)
    })
  })
})
