import * as git from 'isomorphic-git'
import * as fs from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const { promises: fsp } = fs

describe('filters', () => {
  let dir

  beforeEach(async () => {
    dir = join(tmpdir(), `test-filters-${Date.now()}-${Math.random().toString(36).slice(2)}`)
    await fsp.mkdir(dir, { recursive: true })
    await git.init({ fs, dir })
  })

  afterEach(async () => {
    await fsp.rm(dir, { recursive: true, force: true }).catch(() => {})
  })

  describe('applyFilter', () => {
    it('normalizes CRLF to LF in TO_ODB mode', async () => {
      await fsp.writeFile(join(dir, '.gitattributes'), '*.txt text\n')
      const result = await git.applyFilter({
        fs, dir,
        filepath: 'readme.txt',
        content: 'hello\r\nworld\r\n',
        mode: git.FILTER_MODE.TO_ODB,
      })
      expect(result).toBe('hello\nworld\n')
    })

    it('converts LF to CRLF in TO_WORKTREE mode with autocrlf=true', async () => {
      await git.setConfig({ fs, dir, path: 'core.autocrlf', value: 'true' })
      const result = await git.applyFilter({
        fs, dir,
        filepath: 'readme.txt',
        content: 'hello\nworld\n',
        mode: git.FILTER_MODE.TO_WORKTREE,
      })
      expect(result).toBe('hello\r\nworld\r\n')
    })

    it('respects eol=lf attribute', async () => {
      await fsp.writeFile(join(dir, '.gitattributes'), '*.sh text eol=lf\n')
      await git.setConfig({ fs, dir, path: 'core.autocrlf', value: 'true' })
      const result = await git.applyFilter({
        fs, dir,
        filepath: 'script.sh',
        content: 'hello\r\nworld\r\n',
        mode: git.FILTER_MODE.TO_WORKTREE,
      })
      // eol=lf should override autocrlf
      expect(result).toBe('hello\nworld\n')
    })

    it('skips binary files', async () => {
      await fsp.writeFile(join(dir, '.gitattributes'), '*.bin binary\n')
      const content = 'binary\x00data\r\n'
      const result = await git.applyFilter({
        fs, dir,
        filepath: 'data.bin',
        content,
        mode: git.FILTER_MODE.TO_ODB,
      })
      expect(result).toBe(content)
    })

    it('calls custom onFilter for named filters', async () => {
      await fsp.writeFile(join(dir, '.gitattributes'), '*.lfs filter=lfs\n')
      const result = await git.applyFilter({
        fs, dir,
        filepath: 'large.lfs',
        content: 'original content',
        mode: git.FILTER_MODE.TO_ODB,
        onFilter: (name, content, mode) => {
          expect(name).toBe('lfs')
          return `filtered:${content}`
        },
      })
      expect(result).toBe('filtered:original content')
    })
  })

  describe('filterList', () => {
    it('returns crlf filter for text files', async () => {
      await fsp.writeFile(join(dir, '.gitattributes'), '*.txt text\n')
      const filters = await git.filterList({ fs, dir, filepath: 'readme.txt' })
      expect(filters.some(f => f.name === 'crlf')).toBe(true)
    })

    it('returns custom filter from attributes', async () => {
      await fsp.writeFile(join(dir, '.gitattributes'), '*.lfs filter=lfs text\n')
      const filters = await git.filterList({ fs, dir, filepath: 'data.lfs' })
      expect(filters).toEqual([
        { name: 'crlf', type: 'builtin' },
        { name: 'lfs', type: 'custom' },
      ])
    })

    it('returns empty for binary files', async () => {
      await fsp.writeFile(join(dir, '.gitattributes'), '*.bin binary\n')
      const filters = await git.filterList({ fs, dir, filepath: 'data.bin' })
      expect(filters).toEqual([])
    })
  })

  it('exports FILTER_MODE constants', () => {
    expect(git.FILTER_MODE.TO_WORKTREE).toBe(0)
    expect(git.FILTER_MODE.TO_ODB).toBe(1)
  })
})
