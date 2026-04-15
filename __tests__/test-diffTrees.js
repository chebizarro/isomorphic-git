/* eslint-env node, browser, jasmine */
import {
  diffTrees,
  DELTA,
  init,
  add,
  commit,
  remove,
} from 'isomorphic-git'
import * as _fs from 'fs'
import * as os from 'os'
import { join } from 'path'

async function makeRepo() {
  const dir = await _fs.promises.mkdtemp(join(os.tmpdir(), 'test-diff-'))
  await init({ fs: _fs, dir })
  return { fs: _fs, dir }
}

async function makeCommit({ fs, dir, files, message }) {
  for (const [name, content] of Object.entries(files)) {
    const filepath = join(dir, name)
    const parent = join(filepath, '..')
    await fs.promises.mkdir(parent, { recursive: true })
    await fs.promises.writeFile(filepath, content)
    await add({ fs, dir, filepath: name })
  }
  return commit({
    fs,
    dir,
    message,
    author: { name: 'Test', email: 'test@example.com' },
  })
}

describe('diffTrees', () => {
  it('detects no changes between identical trees', async () => {
    const { fs, dir } = await makeRepo()
    const oid = await makeCommit({ fs, dir, files: { 'a.txt': 'hello' }, message: 'init' })

    const deltas = await diffTrees({ fs, dir, oldRef: oid, newRef: oid })
    expect(deltas).toEqual([])
  })

  it('detects added files', async () => {
    const { fs, dir } = await makeRepo()
    const oid1 = await makeCommit({ fs, dir, files: { 'a.txt': 'hello' }, message: 'first' })
    const oid2 = await makeCommit({ fs, dir, files: { 'b.txt': 'world' }, message: 'second' })

    const deltas = await diffTrees({ fs, dir, oldRef: oid1, newRef: oid2 })
    const added = deltas.filter(d => d.status === DELTA.ADDED)
    expect(added).toHaveLength(1)
    expect(added[0].newFile.path).toBe('b.txt')
    expect(added[0].oldFile.oid).toBe('0'.repeat(40))
  })

  it('detects deleted files', async () => {
    const { fs, dir } = await makeRepo()
    const oid1 = await makeCommit({
      fs, dir,
      files: { 'a.txt': 'hello', 'b.txt': 'world' },
      message: 'first',
    })

    // Remove b.txt
    await remove({ fs, dir, filepath: 'b.txt' })
    const oid2 = await commit({
      fs, dir,
      message: 'remove b',
      author: { name: 'Test', email: 'test@example.com' },
    })

    const deltas = await diffTrees({ fs, dir, oldRef: oid1, newRef: oid2 })
    const deleted = deltas.filter(d => d.status === DELTA.DELETED)
    expect(deleted).toHaveLength(1)
    expect(deleted[0].oldFile.path).toBe('b.txt')
    expect(deleted[0].newFile.oid).toBe('0'.repeat(40))
  })

  it('detects modified files', async () => {
    const { fs, dir } = await makeRepo()
    const oid1 = await makeCommit({ fs, dir, files: { 'a.txt': 'hello' }, message: 'first' })
    const oid2 = await makeCommit({ fs, dir, files: { 'a.txt': 'world' }, message: 'second' })

    const deltas = await diffTrees({ fs, dir, oldRef: oid1, newRef: oid2 })
    expect(deltas).toHaveLength(1)
    expect(deltas[0].status).toBe(DELTA.MODIFIED)
    expect(deltas[0].oldFile.path).toBe('a.txt')
    expect(deltas[0].newFile.path).toBe('a.txt')
    expect(deltas[0].oldFile.oid).not.toBe(deltas[0].newFile.oid)
  })

  it('handles files in subdirectories', async () => {
    const { fs, dir } = await makeRepo()
    const oid1 = await makeCommit({
      fs, dir,
      files: { 'src/main.js': 'code' },
      message: 'first',
    })
    const oid2 = await makeCommit({
      fs, dir,
      files: { 'src/main.js': 'updated code', 'src/util.js': 'util' },
      message: 'second',
    })

    const deltas = await diffTrees({ fs, dir, oldRef: oid1, newRef: oid2 })
    expect(deltas).toHaveLength(2)
    const paths = deltas.map(d => d.newFile.path).sort()
    expect(paths).toEqual(['src/main.js', 'src/util.js'])
  })

  it('returns deltas sorted by path', async () => {
    const { fs, dir } = await makeRepo()
    const oid1 = await makeCommit({
      fs, dir,
      files: { 'z.txt': 'z', 'a.txt': 'a', 'm.txt': 'm' },
      message: 'first',
    })
    const oid2 = await makeCommit({
      fs, dir,
      files: { 'z.txt': 'z2', 'a.txt': 'a2', 'm.txt': 'm2' },
      message: 'second',
    })

    const deltas = await diffTrees({ fs, dir, oldRef: oid1, newRef: oid2 })
    const paths = deltas.map(d => d.newFile.path)
    expect(paths).toEqual(['a.txt', 'm.txt', 'z.txt'])
  })

  it('DELTA constants match libgit2 values', () => {
    expect(DELTA.UNMODIFIED).toBe(0)
    expect(DELTA.ADDED).toBe(1)
    expect(DELTA.DELETED).toBe(2)
    expect(DELTA.MODIFIED).toBe(3)
    expect(DELTA.RENAMED).toBe(4)
    expect(DELTA.COPIED).toBe(5)
    expect(DELTA.TYPECHANGE).toBe(8)
    expect(DELTA.CONFLICTED).toBe(10)
  })

  it('handles mixed add/delete/modify in one diff', async () => {
    const { fs, dir } = await makeRepo()
    const oid1 = await makeCommit({
      fs, dir,
      files: { 'keep.txt': 'keep', 'modify.txt': 'old', 'delete.txt': 'bye' },
      message: 'first',
    })

    // Modify one, remove one, add one
    await _fs.promises.writeFile(join(dir, 'modify.txt'), 'new')
    await add({ fs: _fs, dir, filepath: 'modify.txt' })
    await remove({ fs: _fs, dir, filepath: 'delete.txt' })
    await _fs.promises.writeFile(join(dir, 'added.txt'), 'hi')
    await add({ fs: _fs, dir, filepath: 'added.txt' })
    const oid2 = await commit({
      fs: _fs, dir,
      message: 'mixed changes',
      author: { name: 'Test', email: 'test@example.com' },
    })

    const deltas = await diffTrees({ fs: _fs, dir, oldRef: oid1, newRef: oid2 })
    const statusMap = {}
    for (const d of deltas) {
      statusMap[d.oldFile.path || d.newFile.path] = d.status
    }
    expect(statusMap['added.txt']).toBe(DELTA.ADDED)
    expect(statusMap['delete.txt']).toBe(DELTA.DELETED)
    expect(statusMap['modify.txt']).toBe(DELTA.MODIFIED)
    expect(statusMap['keep.txt']).toBeUndefined() // Unmodified — not included
  })
})
