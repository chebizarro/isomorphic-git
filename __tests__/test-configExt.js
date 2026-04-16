import * as git from 'dimorphic-git'
import * as fs from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const { promises: fsp } = fs

describe('config extended', () => {
  let dir

  beforeEach(async () => {
    dir = join(tmpdir(), `test-config-ext-${Date.now()}-${Math.random().toString(36).slice(2)}`)
    await fsp.mkdir(dir, { recursive: true })
    await git.init({ fs, dir })
  })

  afterEach(async () => {
    await fsp.rm(dir, { recursive: true, force: true }).catch(() => {})
  })

  describe('deleteConfig', () => {
    it('deletes a config entry', async () => {
      await git.setConfig({ fs, dir, path: 'user.name', value: 'Test' })
      expect(await git.getConfig({ fs, dir, path: 'user.name' })).toBe('Test')

      await git.deleteConfig({ fs, dir, path: 'user.name' })
      expect(await git.getConfig({ fs, dir, path: 'user.name' })).toBeUndefined()
    })
  })

  describe('appendConfig', () => {
    it('appends a value to create multi-valued entry', async () => {
      await git.setConfig({ fs, dir, path: 'remote.origin.fetch', value: '+refs/heads/*:refs/remotes/origin/*' })
      await git.appendConfig({ fs, dir, path: 'remote.origin.fetch', value: '+refs/tags/*:refs/tags/*' })

      const values = await git.getConfigAll({ fs, dir, path: 'remote.origin.fetch' })
      expect(values.length).toBe(2)
    })
  })

  describe('listConfigSubsections', () => {
    it('lists remote subsections', async () => {
      await git.addRemote({ fs, dir, remote: 'origin', url: 'https://github.com/a/b.git' })
      await git.addRemote({ fs, dir, remote: 'upstream', url: 'https://github.com/c/d.git' })

      const sections = await git.listConfigSubsections({ fs, dir, section: 'remote' })
      expect(sections.sort()).toEqual(['origin', 'upstream'])
    })

    it('returns empty for non-existent section', async () => {
      const sections = await git.listConfigSubsections({ fs, dir, section: 'nonexistent' })
      expect(sections).toEqual([])
    })
  })

  describe('deleteConfigSection', () => {
    it('removes an entire config section', async () => {
      await git.addRemote({ fs, dir, remote: 'temp', url: 'https://example.com' })
      const before = await git.listConfigSubsections({ fs, dir, section: 'remote' })
      expect(before).toContain('temp')

      await git.deleteConfigSection({ fs, dir, section: 'remote', subsection: 'temp' })
      const after = await git.listConfigSubsections({ fs, dir, section: 'remote' })
      expect(after).not.toContain('temp')
    })
  })
})
