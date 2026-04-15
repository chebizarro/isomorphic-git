/* eslint-env node, browser, jasmine */
import { init, add, commit, diffIndexToWorkdir, diffFile, DELTA } from 'isomorphic-git'
import * as _fs from 'fs'
import * as os from 'os'
import { join } from 'path'

describe('diffIndexToWorkdir', () => {
  let dir

  beforeEach(async () => {
    dir = await _fs.promises.mkdtemp(join(os.tmpdir(), 'diff-workdir-'))
    await init({ fs: _fs, dir })
  })

  afterEach(async () => {
    await _fs.promises.rm(dir, { recursive: true, force: true })
  })

  it('detects modified files', async () => {
    await _fs.promises.writeFile(join(dir, 'a.txt'), 'original')
    await add({ fs: _fs, dir, filepath: 'a.txt' })
    await commit({
      fs: _fs,
      dir,
      message: 'initial',
      author: { name: 'Test', email: 'test@test.com' },
    })

    // Modify the file
    await _fs.promises.writeFile(join(dir, 'a.txt'), 'modified')

    const deltas = await diffIndexToWorkdir({ fs: _fs, dir })
    expect(deltas.length).toBe(1)
    expect(deltas[0].status).toBe(DELTA.MODIFIED)
    expect(deltas[0].oldFile.path).toBe('a.txt')
  })

  it('detects deleted files', async () => {
    await _fs.promises.writeFile(join(dir, 'a.txt'), 'content')
    await add({ fs: _fs, dir, filepath: 'a.txt' })
    await commit({
      fs: _fs,
      dir,
      message: 'initial',
      author: { name: 'Test', email: 'test@test.com' },
    })

    await _fs.promises.unlink(join(dir, 'a.txt'))

    const deltas = await diffIndexToWorkdir({ fs: _fs, dir })
    expect(deltas.length).toBe(1)
    expect(deltas[0].status).toBe(DELTA.DELETED)
    expect(deltas[0].oldFile.path).toBe('a.txt')
  })

  it('detects untracked files when includeUntracked is true', async () => {
    await _fs.promises.writeFile(join(dir, 'tracked.txt'), 'tracked')
    await add({ fs: _fs, dir, filepath: 'tracked.txt' })
    await commit({
      fs: _fs,
      dir,
      message: 'initial',
      author: { name: 'Test', email: 'test@test.com' },
    })

    await _fs.promises.writeFile(join(dir, 'untracked.txt'), 'new file')

    const deltas = await diffIndexToWorkdir({ fs: _fs, dir, includeUntracked: true })
    const untracked = deltas.filter(d => d.status === DELTA.ADDED)
    expect(untracked.length).toBe(1)
    expect(untracked[0].newFile.path).toBe('untracked.txt')
  })

  it('does not include untracked files by default', async () => {
    await _fs.promises.writeFile(join(dir, 'tracked.txt'), 'tracked')
    await add({ fs: _fs, dir, filepath: 'tracked.txt' })
    await commit({
      fs: _fs,
      dir,
      message: 'initial',
      author: { name: 'Test', email: 'test@test.com' },
    })

    await _fs.promises.writeFile(join(dir, 'untracked.txt'), 'new file')

    const deltas = await diffIndexToWorkdir({ fs: _fs, dir })
    expect(deltas.length).toBe(0)
  })

  it('returns empty for clean working directory', async () => {
    await _fs.promises.writeFile(join(dir, 'a.txt'), 'content')
    await add({ fs: _fs, dir, filepath: 'a.txt' })
    await commit({
      fs: _fs,
      dir,
      message: 'initial',
      author: { name: 'Test', email: 'test@test.com' },
    })

    const deltas = await diffIndexToWorkdir({ fs: _fs, dir })
    expect(deltas.length).toBe(0)
  })

  it('handles files in subdirectories', async () => {
    await _fs.promises.mkdir(join(dir, 'sub'), { recursive: true })
    await _fs.promises.writeFile(join(dir, 'sub', 'file.txt'), 'original')
    await add({ fs: _fs, dir, filepath: 'sub/file.txt' })
    await commit({
      fs: _fs,
      dir,
      message: 'initial',
      author: { name: 'Test', email: 'test@test.com' },
    })

    await _fs.promises.writeFile(join(dir, 'sub', 'file.txt'), 'modified')

    const deltas = await diffIndexToWorkdir({ fs: _fs, dir })
    expect(deltas.length).toBe(1)
    expect(deltas[0].oldFile.path).toBe('sub/file.txt')
  })

  it('detects multiple changes at once', async () => {
    await _fs.promises.writeFile(join(dir, 'a.txt'), 'a')
    await _fs.promises.writeFile(join(dir, 'b.txt'), 'b')
    await _fs.promises.writeFile(join(dir, 'c.txt'), 'c')
    await add({ fs: _fs, dir, filepath: 'a.txt' })
    await add({ fs: _fs, dir, filepath: 'b.txt' })
    await add({ fs: _fs, dir, filepath: 'c.txt' })
    await commit({
      fs: _fs,
      dir,
      message: 'initial',
      author: { name: 'Test', email: 'test@test.com' },
    })

    await _fs.promises.writeFile(join(dir, 'a.txt'), 'modified-a')
    await _fs.promises.unlink(join(dir, 'b.txt'))
    // c.txt unchanged

    const deltas = await diffIndexToWorkdir({ fs: _fs, dir })
    expect(deltas.length).toBe(2)
    const statuses = deltas.map(d => d.status)
    expect(statuses).toContain(DELTA.MODIFIED)
    expect(statuses).toContain(DELTA.DELETED)
  })
})

describe('diffFile', () => {
  let dir

  beforeEach(async () => {
    dir = await _fs.promises.mkdtemp(join(os.tmpdir(), 'diff-file-'))
    await init({ fs: _fs, dir })
  })

  afterEach(async () => {
    await _fs.promises.rm(dir, { recursive: true, force: true })
  })

  it('generates hunks for a modified file between two commits', async () => {
    await _fs.promises.writeFile(join(dir, 'a.txt'), 'line1\nline2\nline3\n')
    await add({ fs: _fs, dir, filepath: 'a.txt' })
    await commit({
      fs: _fs,
      dir,
      message: 'first',
      author: { name: 'Test', email: 'test@test.com' },
    })

    await _fs.promises.writeFile(join(dir, 'a.txt'), 'line1\nLINE2\nline3\n')
    await add({ fs: _fs, dir, filepath: 'a.txt' })
    await commit({
      fs: _fs,
      dir,
      message: 'second',
      author: { name: 'Test', email: 'test@test.com' },
    })

    const result = await diffFile({
      fs: _fs,
      dir,
      oldRef: 'HEAD~1',
      newRef: 'HEAD',
      filepath: 'a.txt',
    })

    expect(result.hunks.length).toBeGreaterThan(0)
    const lines = result.hunks[0].lines
    expect(lines).toContain('-line2')
    expect(lines).toContain('+LINE2')
  })

  it('returns content for old and new', async () => {
    await _fs.promises.writeFile(join(dir, 'a.txt'), 'old content\n')
    await add({ fs: _fs, dir, filepath: 'a.txt' })
    await commit({
      fs: _fs,
      dir,
      message: 'first',
      author: { name: 'Test', email: 'test@test.com' },
    })

    await _fs.promises.writeFile(join(dir, 'a.txt'), 'new content\n')
    await add({ fs: _fs, dir, filepath: 'a.txt' })
    await commit({
      fs: _fs,
      dir,
      message: 'second',
      author: { name: 'Test', email: 'test@test.com' },
    })

    const result = await diffFile({
      fs: _fs,
      dir,
      oldRef: 'HEAD~1',
      newRef: 'HEAD',
      filepath: 'a.txt',
    })

    expect(result.oldContent).toBe('old content\n')
    expect(result.newContent).toBe('new content\n')
  })

  it('handles new file (oldRef with no file)', async () => {
    await _fs.promises.writeFile(join(dir, 'a.txt'), 'a')
    await add({ fs: _fs, dir, filepath: 'a.txt' })
    await commit({
      fs: _fs,
      dir,
      message: 'first',
      author: { name: 'Test', email: 'test@test.com' },
    })

    await _fs.promises.writeFile(join(dir, 'b.txt'), 'new file content\n')
    await add({ fs: _fs, dir, filepath: 'b.txt' })
    await commit({
      fs: _fs,
      dir,
      message: 'second',
      author: { name: 'Test', email: 'test@test.com' },
    })

    const result = await diffFile({
      fs: _fs,
      dir,
      oldRef: 'HEAD~1',
      newRef: 'HEAD',
      filepath: 'b.txt',
    })

    expect(result.oldContent).toBe('')
    expect(result.newContent).toBe('new file content\n')
    expect(result.hunks.length).toBe(1)
  })
})
