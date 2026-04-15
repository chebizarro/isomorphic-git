/* eslint-env node, browser, jasmine */
import {
  revert,
  init,
  add,
  commit,
  log,
  listFiles,
  resolveRef,
  readBlob,
} from 'isomorphic-git'
import * as _fs from 'fs'
import * as os from 'os'
import { join } from 'path'

const author = { name: 'Test', email: 'test@example.com' }

async function makeRepo() {
  const dir = await _fs.promises.mkdtemp(join(os.tmpdir(), 'test-revert-'))
  await init({ fs: _fs, dir })
  return { fs: _fs, dir }
}

describe('revert', () => {
  it('reverts a commit that added a file', async () => {
    const { fs, dir } = await makeRepo()

    // Initial commit
    await fs.promises.writeFile(join(dir, 'a.txt'), 'a')
    await add({ fs, dir, filepath: 'a.txt' })
    await commit({ fs, dir, message: 'init', author })

    // Add b.txt
    await fs.promises.writeFile(join(dir, 'b.txt'), 'b')
    await add({ fs, dir, filepath: 'b.txt' })
    const addedOid = await commit({ fs, dir, message: 'add b', author })

    // Revert the add
    const newOid = await revert({ fs, dir, oid: addedOid, author })

    expect(newOid).toBeTruthy()
    const files = await listFiles({ fs, dir })
    expect(files).toContain('a.txt')
    expect(files).not.toContain('b.txt')
  })

  it('reverts a commit that modified a file', async () => {
    const { fs, dir } = await makeRepo()

    await fs.promises.writeFile(join(dir, 'a.txt'), 'original')
    await add({ fs, dir, filepath: 'a.txt' })
    await commit({ fs, dir, message: 'init', author })

    await fs.promises.writeFile(join(dir, 'a.txt'), 'modified')
    await add({ fs, dir, filepath: 'a.txt' })
    const modOid = await commit({ fs, dir, message: 'modify a', author })

    await revert({ fs, dir, oid: modOid, author })

    // Read the blob content to verify it's back to original
    const head = await resolveRef({ fs, dir, ref: 'HEAD' })
    const commits = await log({ fs, dir, depth: 1 })
    // The file should be back to 'original'
    const { blob } = await readBlob({ fs, dir, oid: head, filepath: 'a.txt' })
    expect(Buffer.from(blob).toString('utf8')).toBe('original')
  })

  it('generates a proper revert commit message', async () => {
    const { fs, dir } = await makeRepo()

    await fs.promises.writeFile(join(dir, 'a.txt'), 'a')
    await add({ fs, dir, filepath: 'a.txt' })
    await commit({ fs, dir, message: 'init', author })

    await fs.promises.writeFile(join(dir, 'b.txt'), 'b')
    await add({ fs, dir, filepath: 'b.txt' })
    const addOid = await commit({ fs, dir, message: 'add b', author })

    await revert({ fs, dir, oid: addOid, author })

    const commits = await log({ fs, dir, depth: 1 })
    expect(commits[0].commit.message).toContain('Revert "add b"')
    expect(commits[0].commit.message).toContain(`This reverts commit ${addOid}`)
  })

  it('noCommit applies changes without committing', async () => {
    const { fs, dir } = await makeRepo()

    await fs.promises.writeFile(join(dir, 'a.txt'), 'a')
    await add({ fs, dir, filepath: 'a.txt' })
    const base = await commit({ fs, dir, message: 'init', author })

    await fs.promises.writeFile(join(dir, 'b.txt'), 'b')
    await add({ fs, dir, filepath: 'b.txt' })
    const addOid = await commit({ fs, dir, message: 'add b', author })

    const treeOid = await revert({ fs, dir, oid: addOid, author, noCommit: true })

    expect(treeOid).toBeTruthy()
    // HEAD should still point to the last commit, not reverted
    const head = await resolveRef({ fs, dir, ref: 'HEAD' })
    expect(head).toBe(addOid)
  })
})
