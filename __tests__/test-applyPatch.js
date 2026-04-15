import { makeFixture } from './__helpers__/FixtureFS.js'

const { formatPatch, applyPatch } = await import('isomorphic-git')

describe('applyPatch', () => {
  it('applies a patch that modifies a file', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-diffStat')

    // Generate a patch
    const patch = await formatPatch({ fs, dir, gitdir, oldRef: 'first-commit', newRef: 'before-rename' })

    // Apply to a fresh working copy of first-commit state
    const { fs: fs2, dir: dir2, gitdir: gitdir2 } = await makeFixture('test-diffStat')

    // First, write the files at first-commit state
    await fs2.write(`${dir2}/a.txt`, 'line1\nline2\nline3\nline4\nline5\n')

    const results = await applyPatch({ fs: fs2, dir: dir2, gitdir: gitdir2, patch })

    // Should have modified a.txt
    const modResult = results.find(r => r.path === 'a.txt')
    expect(modResult).toBeTruthy()
    expect(modResult.status).toBe('modified')

    // Verify content was actually changed
    const content = (await fs2.read(`${dir2}/a.txt`)).toString()
    expect(content).toContain('modified-line2')
    expect(content).toContain('new-line6')
  })

  it('applies a patch that creates a new file', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-diffStat')
    const patch = await formatPatch({ fs, dir, gitdir, oldRef: 'first-commit', newRef: 'second-commit' })

    const { fs: fs2, dir: dir2, gitdir: gitdir2 } = await makeFixture('test-diffStat')

    const results = await applyPatch({ fs: fs2, dir: dir2, gitdir: gitdir2, patch })

    const createResult = results.find(r => r.path === 'c.txt')
    expect(createResult).toBeTruthy()
    expect(createResult.status).toBe('created')

    const content = (await fs2.read(`${dir2}/c.txt`)).toString()
    expect(content).toContain('new file content')
  })

  it('applies a patch that deletes a file', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-diffStat')
    const patch = await formatPatch({ fs, dir, gitdir, oldRef: 'second-commit', newRef: 'with-delete' })

    const { fs: fs2, dir: dir2, gitdir: gitdir2 } = await makeFixture('test-diffStat')
    // Write b.txt so there's something to delete
    await fs2.write(`${dir2}/b.txt`, 'hello\nworld\nfoo\nbar\nbaz\n')

    const results = await applyPatch({ fs: fs2, dir: dir2, gitdir: gitdir2, patch })

    const delResult = results.find(r => r.path === 'b.txt')
    expect(delResult).toBeTruthy()
    expect(delResult.status).toBe('deleted')
  })

  it('parses hunk headers correctly', async () => {
    const patch = `diff --git a/test.txt b/test.txt
--- a/test.txt
+++ b/test.txt
@@ -1,3 +1,3 @@
 line1
-line2
+modified
 line3
`
    const { fs, dir, gitdir } = await makeFixture('test-diffStat')
    await fs.write(`${dir}/test.txt`, 'line1\nline2\nline3\n')

    const results = await applyPatch({ fs, dir, gitdir, patch })
    expect(results[0].status).toBe('modified')

    const content = (await fs.read(`${dir}/test.txt`)).toString()
    expect(content).toBe('line1\nmodified\nline3\n')
  })
})
