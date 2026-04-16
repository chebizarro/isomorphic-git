/* eslint-env node, browser, jasmine */
import { readReflog, init, add, commit } from 'dimorphic-git'
import * as _fs from 'fs'
import * as os from 'os'
import { join } from 'path'

describe('readReflog', () => {
  it('returns empty array for ref with no reflog', async () => {
    const dir = await _fs.promises.mkdtemp(join(os.tmpdir(), 'test-reflog-'))
    await init({ fs: _fs, dir })

    const entries = await readReflog({ fs: _fs, dir, ref: 'HEAD' })
    expect(entries).toEqual([])
  })

  it('reads reflog entries with correct structure', async () => {
    const dir = await _fs.promises.mkdtemp(join(os.tmpdir(), 'test-reflog-'))
    await init({ fs: _fs, dir })

    // Manually create a reflog entry
    const gitdir = join(dir, '.git')
    await _fs.promises.mkdir(join(gitdir, 'logs'), { recursive: true })
    const oid = 'a'.repeat(40)
    const prevOid = '0'.repeat(40)
    const reflogLine = `${prevOid} ${oid} Test User <test@example.com> 1700000000 +0100\tcommit: initial\n`
    await _fs.promises.writeFile(join(gitdir, 'logs', 'HEAD'), reflogLine)

    const entries = await readReflog({ fs: _fs, dir, ref: 'HEAD' })
    expect(entries).toHaveLength(1)
    expect(entries[0].oid).toBe(oid)
    expect(entries[0].previousOid).toBe(prevOid)
    expect(entries[0].author.name).toBe('Test User')
    expect(entries[0].author.email).toBe('test@example.com')
    expect(entries[0].author.timestamp).toBe(1700000000)
    expect(entries[0].author.timezoneOffset).toBe(60)
    expect(entries[0].message).toBe('commit: initial')
  })

  it('returns entries newest-first', async () => {
    const dir = await _fs.promises.mkdtemp(join(os.tmpdir(), 'test-reflog-'))
    await init({ fs: _fs, dir })

    const gitdir = join(dir, '.git')
    await _fs.promises.mkdir(join(gitdir, 'logs'), { recursive: true })
    const oid1 = 'a'.repeat(40)
    const oid2 = 'b'.repeat(40)
    const zero = '0'.repeat(40)
    const lines =
      `${zero} ${oid1} Test <t@e.com> 1000000000 +0000\tfirst\n` +
      `${oid1} ${oid2} Test <t@e.com> 2000000000 +0000\tsecond\n`
    await _fs.promises.writeFile(join(gitdir, 'logs', 'HEAD'), lines)

    const entries = await readReflog({ fs: _fs, dir, ref: 'HEAD' })
    expect(entries).toHaveLength(2)
    // Newest first
    expect(entries[0].message).toBe('second')
    expect(entries[1].message).toBe('first')
  })

  it('handles nested ref paths like refs/heads/main', async () => {
    const dir = await _fs.promises.mkdtemp(join(os.tmpdir(), 'test-reflog-'))
    await init({ fs: _fs, dir })

    const gitdir = join(dir, '.git')
    await _fs.promises.mkdir(join(gitdir, 'logs', 'refs', 'heads'), { recursive: true })
    const oid = 'c'.repeat(40)
    const zero = '0'.repeat(40)
    const line = `${zero} ${oid} Test <t@e.com> 1700000000 +0000\tbranch: Created\n`
    await _fs.promises.writeFile(join(gitdir, 'logs', 'refs', 'heads', 'main'), line)

    const entries = await readReflog({ fs: _fs, dir, ref: 'refs/heads/main' })
    expect(entries).toHaveLength(1)
    expect(entries[0].oid).toBe(oid)
    expect(entries[0].message).toBe('branch: Created')
  })

  it('parses negative timezone offsets', async () => {
    const dir = await _fs.promises.mkdtemp(join(os.tmpdir(), 'test-reflog-'))
    await init({ fs: _fs, dir })

    const gitdir = join(dir, '.git')
    await _fs.promises.mkdir(join(gitdir, 'logs'), { recursive: true })
    const oid = 'd'.repeat(40)
    const zero = '0'.repeat(40)
    const line = `${zero} ${oid} Test <t@e.com> 1700000000 -0530\ttest\n`
    await _fs.promises.writeFile(join(gitdir, 'logs', 'HEAD'), line)

    const entries = await readReflog({ fs: _fs, dir, ref: 'HEAD' })
    expect(entries[0].author.timezoneOffset).toBe(-330)
  })
})
