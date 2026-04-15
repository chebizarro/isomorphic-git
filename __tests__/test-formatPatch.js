import { makeFixture } from './__helpers__/FixtureFS.js'

const { formatPatch } = await import('isomorphic-git')

describe('formatPatch', () => {
  it('generates unified diff output', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-diffStat')
    const patch = await formatPatch({ fs, dir, gitdir, oldRef: 'HEAD~1', newRef: 'HEAD' })

    expect(typeof patch).toBe('string')
    expect(patch).toContain('diff --git')
    expect(patch).toContain('---')
    expect(patch).toContain('+++')
    expect(patch).toContain('@@')
  })

  it('returns empty for identical refs', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-diffStat')
    const patch = await formatPatch({ fs, dir, gitdir, oldRef: 'HEAD', newRef: 'HEAD' })

    expect(patch).toBe('')
  })

  it('shows /dev/null for new files', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-diffStat')
    // First commit adds all files — compare against empty tree parent
    // We use the tag that marks the initial commit
    const patch = await formatPatch({ fs, dir, gitdir, oldRef: 'first-commit', newRef: 'second-commit' })

    expect(patch).toContain('--- /dev/null')
    expect(patch).toContain('+++ b/')
  })

  it('shows /dev/null for deleted files', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-diffStat')
    const patch = await formatPatch({ fs, dir, gitdir, oldRef: 'second-commit', newRef: 'with-delete' })

    expect(patch).toContain('--- a/')
    expect(patch).toContain('+++ /dev/null')
  })

  it('respects contextLines parameter', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-diffStat')
    const patch0 = await formatPatch({ fs, dir, gitdir, oldRef: 'HEAD~1', newRef: 'HEAD', contextLines: 0 })
    const patch5 = await formatPatch({ fs, dir, gitdir, oldRef: 'HEAD~1', newRef: 'HEAD', contextLines: 5 })

    // More context = longer patch
    expect(patch5.length).toBeGreaterThanOrEqual(patch0.length)
  })
})
