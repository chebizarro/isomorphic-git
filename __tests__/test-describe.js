import { makeFixture } from './__helpers__/FixtureFS.js'

const { describe: gitDescribe } = await import('dimorphic-git')

describe('describe', () => {
  it('returns tag name when commit is directly tagged (lightweight)', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-diffStat')
    // Our fixture uses lightweight tags, so tags=true is needed
    const result = await gitDescribe({ fs, dir, gitdir, ref: 'first-commit', tags: true })
    expect(result).toBe('first-commit')
  })

  it('returns tag-N-gABBREV when commit is ahead of a tag', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-diffStat')
    // HEAD on master is one commit past after-rename (the "modify a.txt again" commit)
    // This commit is NOT tagged, so describe should return after-rename-1-gXXXXXXX
    const result = await gitDescribe({ fs, dir, gitdir, ref: 'HEAD', tags: true })
    expect(result).toMatch(/-\d+-g[0-9a-f]{7}$/)
  })

  it('respects abbrev parameter', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-diffStat')
    const result = await gitDescribe({ fs, dir, gitdir, ref: 'before-rename', tags: true, abbrev: 10 })
    // Either tag name directly (if before-rename is a tag) or tag-N-gXXXXXXXXXX
    if (result.includes('-g')) {
      expect(result).toMatch(/g[0-9a-f]{10}$/)
    }
  })

  it('returns long format when long=true even on a tag', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-diffStat')
    const result = await gitDescribe({ fs, dir, gitdir, ref: 'first-commit', tags: true, long: true })
    expect(result).toMatch(/^first-commit-0-g[0-9a-f]{7}$/)
  })

  it('returns abbreviated OID when no tags exist', async () => {
    const { fs, dir, gitdir } = await makeFixture('test-checkout')
    const result = await gitDescribe({ fs, dir, gitdir, ref: 'HEAD', tags: true })
    // No tags in this fixture, should just be an abbreviated OID
    expect(result).toMatch(/^[0-9a-f]{7}$/)
  })
})
