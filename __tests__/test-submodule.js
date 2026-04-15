import * as git from 'isomorphic-git'
import * as fs from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const { promises: fsp } = fs

describe('submodule', () => {
  let dir

  beforeEach(async () => {
    dir = join(tmpdir(), `test-submodule-${Date.now()}-${Math.random().toString(36).slice(2)}`)
    await fsp.mkdir(dir, { recursive: true })
    await git.init({ fs, dir })
    // Create initial commit
    await fsp.writeFile(join(dir, 'README.md'), '# Test')
    await git.add({ fs, dir, filepath: 'README.md' })
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

  describe('submoduleList', () => {
    it('returns empty array when no .gitmodules', async () => {
      const result = await git.submoduleList({ fs, dir })
      expect(result).toEqual([])
    })

    it('lists submodules from .gitmodules', async () => {
      await fsp.writeFile(join(dir, '.gitmodules'), `[submodule "libs/foo"]
\tpath = libs/foo
\turl = https://github.com/example/foo.git
\tbranch = main
[submodule "libs/bar"]
\tpath = libs/bar
\turl = https://github.com/example/bar.git
`)
      const result = await git.submoduleList({ fs, dir })
      expect(result.length).toBe(2)
      expect(result[0]).toEqual({
        name: 'libs/foo',
        path: 'libs/foo',
        url: 'https://github.com/example/foo.git',
        branch: 'main',
      })
      expect(result[1]).toEqual({
        name: 'libs/bar',
        path: 'libs/bar',
        url: 'https://github.com/example/bar.git',
        branch: undefined,
      })
    })
  })

  describe('submoduleAdd', () => {
    it('writes to .gitmodules and .git/config', async () => {
      await git.submoduleAdd({
        fs,
        dir,
        url: 'https://github.com/example/test.git',
        path: 'vendor/test',
        branch: 'main',
      })

      // Verify .gitmodules
      const content = await fsp.readFile(join(dir, '.gitmodules'), 'utf8')
      expect(content).toContain('[submodule "vendor/test"]')
      expect(content).toContain('path = vendor/test')
      expect(content).toContain('url = https://github.com/example/test.git')
      expect(content).toContain('branch = main')

      // Verify .git/config
      const configUrl = await git.getConfig({ fs, dir, path: 'submodule.vendor/test.url' })
      expect(configUrl).toBe('https://github.com/example/test.git')
    })
  })

  describe('submoduleInit', () => {
    it('copies URL from .gitmodules to .git/config', async () => {
      await fsp.writeFile(join(dir, '.gitmodules'), `[submodule "mylib"]
\tpath = lib/mylib
\turl = https://github.com/example/mylib.git
`)
      await git.submoduleInit({ fs, dir, path: 'lib/mylib' })

      const url = await git.getConfig({ fs, dir, path: 'submodule.mylib.url' })
      expect(url).toBe('https://github.com/example/mylib.git')
    })

    it('throws for unknown submodule', async () => {
      await expect(
        git.submoduleInit({ fs, dir, path: 'nonexistent' })
      ).rejects.toThrow(/not found/)
    })
  })

  describe('submoduleSync', () => {
    it('updates .git/config URL from .gitmodules', async () => {
      await fsp.writeFile(join(dir, '.gitmodules'), `[submodule "mylib"]
\tpath = mylib
\turl = https://github.com/example/mylib.git
`)
      await git.submoduleInit({ fs, dir, path: 'mylib' })

      // Modify .gitmodules URL
      await fsp.writeFile(join(dir, '.gitmodules'), `[submodule "mylib"]
\tpath = mylib
\turl = https://github.com/new/mylib.git
`)

      await git.submoduleSync({ fs, dir })
      const url = await git.getConfig({ fs, dir, path: 'submodule.mylib.url' })
      expect(url).toBe('https://github.com/new/mylib.git')
    })
  })

  describe('submoduleStatus', () => {
    it('reports IN_CONFIG for submodule in .gitmodules', async () => {
      await fsp.writeFile(join(dir, '.gitmodules'), `[submodule "mylib"]
\tpath = mylib
\turl = https://github.com/example/mylib.git
`)
      const status = await git.submoduleStatus({ fs, dir, path: 'mylib' })
      expect(status.name).toBe('mylib')
      expect(status.url).toBe('https://github.com/example/mylib.git')
      expect(status.status & git.SUBMODULE_STATUS.IN_CONFIG).toBeTruthy()
    })

    it('reports not IN_WD when directory missing', async () => {
      await fsp.writeFile(join(dir, '.gitmodules'), `[submodule "mylib"]
\tpath = mylib
\turl = https://github.com/example/mylib.git
`)
      const status = await git.submoduleStatus({ fs, dir, path: 'mylib' })
      expect(status.status & git.SUBMODULE_STATUS.IN_WD).toBeFalsy()
    })
  })

  describe('SUBMODULE_STATUS constants', () => {
    it('exports correct flag values', () => {
      expect(git.SUBMODULE_STATUS.IN_HEAD).toBe(1)
      expect(git.SUBMODULE_STATUS.IN_INDEX).toBe(2)
      expect(git.SUBMODULE_STATUS.IN_CONFIG).toBe(4)
      expect(git.SUBMODULE_STATUS.IN_WD).toBe(8)
      expect(git.SUBMODULE_STATUS.INDEX_ADDED).toBe(16)
    })
  })
})
