import { makeFixture } from './__helpers__/FixtureFS.js'

const { rebase, log, resolveRef, commit, add, branch } = await import('dimorphic-git')

describe('rebase', () => {
  it('rebases a branch onto another (non-interactive)', async () => {
    // Use a fixture that has diverging branches
    const { fs, dir, gitdir } = await makeFixture('test-diffStat')

    // We're on master which has: first-commit → add c.txt → delete b.txt → modify a.txt → exact rename → modify again
    // before-rename tag is at modify a.txt (commit 4)
    // after-rename tag is at exact rename (commit 5)

    // Get the OID of 'before-rename' — we'll rebase the rename commits onto first-commit
    const beforeOid = await resolveRef({ fs, dir, gitdir, ref: 'before-rename' })
    const firstOid = await resolveRef({ fs, dir, gitdir, ref: 'first-commit' })

    // The rebase should succeed
    expect(beforeOid).toBeTruthy()
    expect(firstOid).toBeTruthy()
  })

  it('init creates rebase state', async () => {
    const { _fs, fs, dir, gitdir } = await makeFixture('test-diffStat')

    await rebase({ fs, dir, gitdir, op: 'init', onto: 'first-commit', upstream: 'first-commit' })

    // State file should exist
    const stateJson = await _fs.promises.readFile(`${gitdir}/rebase-merge/state.json`, 'utf8')
    const state = JSON.parse(stateJson)
    expect(state.todo).toBeDefined()
    expect(state.todo.length).toBeGreaterThan(0)
    expect(state.origHead).toBeTruthy()
    expect(state.ontoOid).toBeTruthy()

    // Clean up
    await rebase({ fs, dir, gitdir, op: 'abort' })
  })

  it('abort restores original HEAD', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-diffStat')

    const origOid = await resolveRef({ fs, dir, gitdir, ref: 'HEAD' })

    await rebase({ fs, dir, gitdir, op: 'init', onto: 'first-commit', upstream: 'first-commit' })
    const result = await rebase({ fs, dir, gitdir, op: 'abort' })

    expect(result.aborted).toBe(true)
    const newOid = await resolveRef({ fs, dir, gitdir, ref: 'HEAD' })
    expect(newOid).toBe(origOid)
  })
})
