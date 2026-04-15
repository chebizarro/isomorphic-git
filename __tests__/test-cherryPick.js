/* eslint-env node, browser, jasmine */
import {
  cherryPick,
  init,
  add,
  commit,
  log,
  readBlob,
  listFiles,
  branch,
  checkout,
  resolveRef,
} from 'isomorphic-git'
import * as _fs from 'fs'
import * as os from 'os'
import { join } from 'path'

const author = { name: 'Test', email: 'test@example.com' }

async function makeRepo() {
  const dir = await _fs.promises.mkdtemp(join(os.tmpdir(), 'test-cp-'))
  await init({ fs: _fs, dir })
  return { fs: _fs, dir }
}

describe('cherryPick', () => {
  it('cherry-picks a commit onto the current branch', async () => {
    const { fs, dir } = await makeRepo()

    // Create initial commit on main
    await fs.promises.writeFile(join(dir, 'a.txt'), 'a')
    await add({ fs, dir, filepath: 'a.txt' })
    const base = await commit({ fs, dir, message: 'init', author })

    // Create a second commit that adds b.txt
    await fs.promises.writeFile(join(dir, 'b.txt'), 'b-content')
    await add({ fs, dir, filepath: 'b.txt' })
    const featureOid = await commit({ fs, dir, message: 'add b', author })

    // Reset to base (create a branch from base and checkout)
    await branch({ fs, dir, ref: 'other', object: base })
    await checkout({ fs, dir, ref: 'other' })

    // Cherry-pick the feature commit
    const newOid = await cherryPick({
      fs, dir, oid: featureOid, author,
    })

    expect(newOid).toBeTruthy()

    // Verify b.txt is now in the tree
    const files = await listFiles({ fs, dir })
    expect(files).toContain('b.txt')

    // Verify the content
    const head = await resolveRef({ fs, dir, ref: 'HEAD' })
    expect(head).toBe(newOid)
  })

  it('preserves the original commit message', async () => {
    const { fs, dir } = await makeRepo()

    await fs.promises.writeFile(join(dir, 'a.txt'), 'a')
    await add({ fs, dir, filepath: 'a.txt' })
    const base = await commit({ fs, dir, message: 'init', author })

    await fs.promises.writeFile(join(dir, 'b.txt'), 'b')
    await add({ fs, dir, filepath: 'b.txt' })
    const featureOid = await commit({ fs, dir, message: 'add feature B', author })

    await branch({ fs, dir, ref: 'other', object: base })
    await checkout({ fs, dir, ref: 'other' })

    await cherryPick({ fs, dir, oid: featureOid, author })

    const commits = await log({ fs, dir, depth: 1 })
    expect(commits[0].commit.message).toBe('add feature B\n')
  })

  it('allows custom message override', async () => {
    const { fs, dir } = await makeRepo()

    await fs.promises.writeFile(join(dir, 'a.txt'), 'a')
    await add({ fs, dir, filepath: 'a.txt' })
    const base = await commit({ fs, dir, message: 'init', author })

    await fs.promises.writeFile(join(dir, 'b.txt'), 'b')
    await add({ fs, dir, filepath: 'b.txt' })
    const featureOid = await commit({ fs, dir, message: 'original', author })

    await branch({ fs, dir, ref: 'other', object: base })
    await checkout({ fs, dir, ref: 'other' })

    await cherryPick({
      fs, dir, oid: featureOid, author, message: 'custom message',
    })

    const commits = await log({ fs, dir, depth: 1 })
    expect(commits[0].commit.message).toBe('custom message\n')
  })

  it('noCommit applies changes without committing', async () => {
    const { fs, dir } = await makeRepo()

    await fs.promises.writeFile(join(dir, 'a.txt'), 'a')
    await add({ fs, dir, filepath: 'a.txt' })
    const base = await commit({ fs, dir, message: 'init', author })

    await fs.promises.writeFile(join(dir, 'b.txt'), 'b')
    await add({ fs, dir, filepath: 'b.txt' })
    const featureOid = await commit({ fs, dir, message: 'add b', author })

    await branch({ fs, dir, ref: 'other', object: base })
    await checkout({ fs, dir, ref: 'other' })

    const treeOid = await cherryPick({
      fs, dir, oid: featureOid, author, noCommit: true,
    })

    expect(treeOid).toBeTruthy()
    // HEAD should still point to base
    const head = await resolveRef({ fs, dir, ref: 'HEAD' })
    expect(head).toBe(base)
  })
})
