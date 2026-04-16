/* eslint-env node, browser, jasmine */
import {
  reset,
  resolveRef,
  listFiles,
  init,
  add,
  commit,
} from 'dimorphic-git'
import * as _fs from 'fs'
import * as os from 'os'
import { join } from 'path'

/**
 * Helper: create a fresh temp repo with two commits so we can reset between them.
 * Returns { fs, dir, oid1, oid2 } where oid2 is HEAD.
 */
async function makeTwoCommitRepo() {
  const dir = await _fs.promises.mkdtemp(join(os.tmpdir(), 'test-reset-'))

  await init({ fs: _fs, dir })

  // First commit
  await _fs.promises.writeFile(join(dir, 'a.txt'), 'first')
  await add({ fs: _fs, dir, filepath: 'a.txt' })
  const oid1 = await commit({
    fs: _fs,
    dir,
    message: 'first commit',
    author: { name: 'Test', email: 'test@example.com' },
  })

  // Second commit
  await _fs.promises.writeFile(join(dir, 'b.txt'), 'second')
  await add({ fs: _fs, dir, filepath: 'b.txt' })
  const oid2 = await commit({
    fs: _fs,
    dir,
    message: 'second commit',
    author: { name: 'Test', email: 'test@example.com' },
  })

  return { fs: _fs, dir, oid1, oid2 }
}

describe('reset', () => {
  it('soft reset moves HEAD to target but keeps index', async () => {
    const { fs, dir, oid1, oid2 } = await makeTwoCommitRepo()

    // Index before reset should have both files (a.txt, b.txt)
    const filesBefore = await listFiles({ fs, dir })
    expect(filesBefore).toContain('a.txt')
    expect(filesBefore).toContain('b.txt')

    await reset({ fs, dir, ref: oid1, mode: 'soft' })

    const newHead = await resolveRef({ fs, dir, ref: 'HEAD' })
    expect(newHead).toBe(oid1)

    // Soft reset should NOT change the index — b.txt still staged
    const filesAfter = await listFiles({ fs, dir })
    expect(filesAfter).toContain('b.txt')
  })

  it('mixed reset moves HEAD and resets index', async () => {
    const { fs, dir, oid1, oid2 } = await makeTwoCommitRepo()

    await reset({ fs, dir, ref: oid1, mode: 'mixed' })

    const newHead = await resolveRef({ fs, dir, ref: 'HEAD' })
    expect(newHead).toBe(oid1)

    // Index should be reset to match oid1's tree — only a.txt
    const filesAfter = await listFiles({ fs, dir })
    expect(filesAfter).toContain('a.txt')
    expect(filesAfter).not.toContain('b.txt')
  })

  it('hard reset moves HEAD, resets index, and resets workdir', async () => {
    const { fs, dir, oid1, oid2 } = await makeTwoCommitRepo()

    await reset({ fs, dir, ref: oid1, mode: 'hard' })

    const newHead = await resolveRef({ fs, dir, ref: 'HEAD' })
    expect(newHead).toBe(oid1)

    // Index should only have a.txt
    const filesAfter = await listFiles({ fs, dir })
    expect(filesAfter).toContain('a.txt')
    expect(filesAfter).not.toContain('b.txt')

    // Working directory should also not have b.txt
    const workdirFiles = await fs.promises.readdir(dir)
    expect(workdirFiles).toContain('a.txt')
    expect(workdirFiles).not.toContain('b.txt')
  })

  it('throws on invalid mode', async () => {
    const { fs, dir } = await makeTwoCommitRepo()
    await expect(
      reset({ fs, dir, ref: 'HEAD', mode: 'invalid' })
    ).rejects.toThrow('Invalid reset mode')
  })
})
