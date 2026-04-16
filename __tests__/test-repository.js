import * as git from 'dimorphic-git'
import * as fs from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const { promises: fsp } = fs

describe('repository state and introspection', () => {
  let dir, gitdir

  beforeEach(async () => {
    dir = join(tmpdir(), `test-repo-${Date.now()}-${Math.random().toString(36).slice(2)}`)
    await fsp.mkdir(dir, { recursive: true })
    await git.init({ fs, dir })
    gitdir = join(dir, '.git')
  })

  afterEach(async () => {
    await fsp.rm(dir, { recursive: true, force: true }).catch(() => {})
  })

  describe('repositoryState', () => {
    it('returns NONE for a clean repository', async () => {
      const state = await git.repositoryState({ fs, dir })
      expect(state).toBe(git.REPOSITORY_STATE.NONE)
    })

    it('returns MERGE when MERGE_HEAD exists', async () => {
      await fsp.writeFile(join(gitdir, 'MERGE_HEAD'), 'abc123\n')
      const state = await git.repositoryState({ fs, dir })
      expect(state).toBe(git.REPOSITORY_STATE.MERGE)
    })

    it('returns CHERRYPICK when CHERRY_PICK_HEAD exists', async () => {
      await fsp.writeFile(join(gitdir, 'CHERRY_PICK_HEAD'), 'abc123\n')
      const state = await git.repositoryState({ fs, dir })
      expect(state).toBe(git.REPOSITORY_STATE.CHERRYPICK)
    })

    it('returns REVERT when REVERT_HEAD exists', async () => {
      await fsp.writeFile(join(gitdir, 'REVERT_HEAD'), 'abc123\n')
      const state = await git.repositoryState({ fs, dir })
      expect(state).toBe(git.REPOSITORY_STATE.REVERT)
    })

    it('returns REBASE_INTERACTIVE for rebase-merge/interactive', async () => {
      await fsp.mkdir(join(gitdir, 'rebase-merge'), { recursive: true })
      await fsp.writeFile(join(gitdir, 'rebase-merge', 'interactive'), '')
      const state = await git.repositoryState({ fs, dir })
      expect(state).toBe(git.REPOSITORY_STATE.REBASE_INTERACTIVE)
    })

    it('returns REBASE_MERGE for rebase-merge without interactive', async () => {
      await fsp.mkdir(join(gitdir, 'rebase-merge'), { recursive: true })
      await fsp.writeFile(join(gitdir, 'rebase-merge', 'head-name'), 'refs/heads/main\n')
      const state = await git.repositoryState({ fs, dir })
      expect(state).toBe(git.REPOSITORY_STATE.REBASE_MERGE)
    })

    it('returns BISECT when BISECT_LOG exists', async () => {
      await fsp.writeFile(join(gitdir, 'BISECT_LOG'), '# bisect log\n')
      const state = await git.repositoryState({ fs, dir })
      expect(state).toBe(git.REPOSITORY_STATE.BISECT)
    })
  })

  describe('repositoryStateCleanup', () => {
    it('removes MERGE_HEAD and MERGE_MSG', async () => {
      await fsp.writeFile(join(gitdir, 'MERGE_HEAD'), 'abc\n')
      await fsp.writeFile(join(gitdir, 'MERGE_MSG'), 'merge msg\n')
      let state = await git.repositoryState({ fs, dir })
      expect(state).toBe(git.REPOSITORY_STATE.MERGE)

      await git.repositoryStateCleanup({ fs, dir })
      state = await git.repositoryState({ fs, dir })
      expect(state).toBe(git.REPOSITORY_STATE.NONE)
    })

    it('removes rebase-merge directory', async () => {
      await fsp.mkdir(join(gitdir, 'rebase-merge'), { recursive: true })
      await fsp.writeFile(join(gitdir, 'rebase-merge', 'interactive'), '')
      let state = await git.repositoryState({ fs, dir })
      expect(state).toBe(git.REPOSITORY_STATE.REBASE_INTERACTIVE)

      await git.repositoryStateCleanup({ fs, dir })
      state = await git.repositoryState({ fs, dir })
      expect(state).toBe(git.REPOSITORY_STATE.NONE)
    })
  })

  describe('isBare', () => {
    it('returns false for a normal repo', async () => {
      expect(await git.isBare({ fs, dir })).toBe(false)
    })

    it('returns true when core.bare is set', async () => {
      await git.setConfig({ fs, dir, path: 'core.bare', value: true })
      expect(await git.isBare({ fs, dir })).toBe(true)
    })
  })

  describe('isEmpty', () => {
    it('returns true for a fresh repo with no commits', async () => {
      expect(await git.isEmpty({ fs, dir })).toBe(true)
    })

    it('returns false after a commit', async () => {
      await fsp.writeFile(join(dir, 'hello.txt'), 'hello')
      await git.add({ fs, dir, filepath: 'hello.txt' })
      await git.commit({
        fs,
        dir,
        message: 'first',
        author: { name: 'Test', email: 'test@test.com' },
      })
      expect(await git.isEmpty({ fs, dir })).toBe(false)
    })
  })

  describe('isShallow', () => {
    it('returns false for a normal repo', async () => {
      expect(await git.isShallow({ fs, dir })).toBe(false)
    })

    it('returns true when shallow file has content', async () => {
      await fsp.writeFile(join(gitdir, 'shallow'), 'abc123abc123abc123abc123abc123abc123abcd\n')
      expect(await git.isShallow({ fs, dir })).toBe(true)
    })
  })

  describe('isHeadDetached', () => {
    it('returns false when HEAD points to a branch', async () => {
      expect(await git.isHeadDetached({ fs, dir })).toBe(false)
    })

    it('returns true when HEAD contains an OID', async () => {
      await fsp.writeFile(join(gitdir, 'HEAD'), 'abc123abc123abc123abc123abc123abc123abcd')
      expect(await git.isHeadDetached({ fs, dir })).toBe(true)
    })
  })

  describe('isHeadUnborn', () => {
    it('returns true for a fresh repo', async () => {
      expect(await git.isHeadUnborn({ fs, dir })).toBe(true)
    })

    it('returns false after a commit', async () => {
      await fsp.writeFile(join(dir, 'hello.txt'), 'hello')
      await git.add({ fs, dir, filepath: 'hello.txt' })
      await git.commit({
        fs,
        dir,
        message: 'first',
        author: { name: 'Test', email: 'test@test.com' },
      })
      expect(await git.isHeadUnborn({ fs, dir })).toBe(false)
    })
  })
})
