/* eslint-env node, browser, jasmine */
import { init, commit, add, resolveRef } from 'dimorphic-git'
import { readReflog } from 'dimorphic-git'
import { FileSystem } from 'dimorphic-git/internal-apis'
import * as _fs from 'fs'
import * as os from 'os'
import { join } from 'path'

import { appendReflog } from '../src/utils/appendReflog.js'

describe('appendReflog', () => {
  let dir, gitdir, fs

  beforeEach(async () => {
    dir = await _fs.promises.mkdtemp(join(os.tmpdir(), 'reflog-write-'))
    gitdir = join(dir, '.git')
    fs = new FileSystem(_fs)
    await init({ fs: _fs, dir })
    await _fs.promises.writeFile(join(dir, 'a.txt'), 'hello')
    await add({ fs: _fs, dir, filepath: 'a.txt' })
    await commit({
      fs: _fs,
      dir,
      message: 'initial',
      author: { name: 'Test', email: 'test@test.com' },
    })
  })

  afterEach(async () => {
    await _fs.promises.rm(dir, { recursive: true, force: true })
  })

  it('creates a new reflog file and appends an entry', async () => {
    const oid = await resolveRef({ fs: _fs, dir, ref: 'HEAD' })
    const ZERO = '0'.repeat(40)

    await appendReflog({
      fs,
      gitdir,
      ref: 'HEAD',
      previousOid: ZERO,
      oid,
      author: { name: 'Test', email: 'test@test.com', timestamp: 1000000000, timezoneOffset: 0 },
      message: 'commit (initial): initial',
    })

    const entries = await readReflog({ fs: _fs, dir, ref: 'HEAD' })
    expect(entries.length).toBe(1)
    expect(entries[0].oid).toBe(oid)
    expect(entries[0].previousOid).toBe(ZERO)
    expect(entries[0].message).toBe('commit (initial): initial')
    expect(entries[0].author.name).toBe('Test')
  })

  it('appends multiple entries (newest last in file, newest first when read)', async () => {
    const oid = await resolveRef({ fs: _fs, dir, ref: 'HEAD' })
    const ZERO = '0'.repeat(40)
    const fakeOid = 'a'.repeat(40)

    await appendReflog({
      fs,
      gitdir,
      ref: 'refs/heads/master',
      previousOid: ZERO,
      oid,
      author: { name: 'Test', email: 'test@test.com', timestamp: 1000000000, timezoneOffset: 0 },
      message: 'commit: first',
    })

    await appendReflog({
      fs,
      gitdir,
      ref: 'refs/heads/master',
      previousOid: oid,
      oid: fakeOid,
      author: { name: 'Test', email: 'test@test.com', timestamp: 1000000001, timezoneOffset: -300 },
      message: 'commit: second',
    })

    const entries = await readReflog({ fs: _fs, dir, ref: 'refs/heads/master' })
    expect(entries.length).toBe(2)
    // Newest first
    expect(entries[0].message).toBe('commit: second')
    expect(entries[0].oid).toBe(fakeOid)
    expect(entries[1].message).toBe('commit: first')
    expect(entries[1].oid).toBe(oid)
  })

  it('formats timezone offset correctly', async () => {
    const oid = await resolveRef({ fs: _fs, dir, ref: 'HEAD' })

    await appendReflog({
      fs,
      gitdir,
      ref: 'HEAD',
      previousOid: '0'.repeat(40),
      oid,
      author: { name: 'Test', email: 'test@test.com', timestamp: 1000000000, timezoneOffset: -300 },
      message: 'test tz',
    })

    const entries = await readReflog({ fs: _fs, dir, ref: 'HEAD' })
    expect(entries[0].author.timezoneOffset).toBe(-300)
  })

  it('creates nested directories for deep refs', async () => {
    const oid = await resolveRef({ fs: _fs, dir, ref: 'HEAD' })

    await appendReflog({
      fs,
      gitdir,
      ref: 'refs/heads/feature/deep/branch',
      previousOid: '0'.repeat(40),
      oid,
      author: { name: 'Test', email: 'test@test.com', timestamp: 1000000000, timezoneOffset: 0 },
      message: 'branch: created',
    })

    const entries = await readReflog({ fs: _fs, dir, ref: 'refs/heads/feature/deep/branch' })
    expect(entries.length).toBe(1)
    expect(entries[0].message).toBe('branch: created')
  })
})
