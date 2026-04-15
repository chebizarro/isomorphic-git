/* eslint-env node, browser, jasmine */
import { aheadBehind, resolveRef, log } from 'isomorphic-git'

import { makeFixture } from './__helpers__/FixtureFS.js'

describe('aheadBehind', () => {
  it('returns 0,0 for same commit', async () => {
    const { fs, gitdir } = await makeFixture('test-log')
    const oid = await resolveRef({ fs, gitdir, ref: 'HEAD' })
    const result = await aheadBehind({ fs, gitdir, ourOid: oid, theirOid: oid })
    expect(result).toEqual({ ahead: 0, behind: 0 })
  })

  it('counts ahead commits correctly', async () => {
    const { fs, gitdir } = await makeFixture('test-log')
    // HEAD is 5 commits deep. HEAD~4 is the root.
    const commits = await log({ fs, gitdir, ref: 'HEAD' })
    const headOid = commits[0].oid
    const olderOid = commits[2].oid // HEAD~2
    const result = await aheadBehind({ fs, gitdir, ourOid: headOid, theirOid: olderOid })
    expect(result.ahead).toBe(2)
    expect(result.behind).toBe(0)
  })

  it('counts behind commits correctly', async () => {
    const { fs, gitdir } = await makeFixture('test-log')
    const commits = await log({ fs, gitdir, ref: 'HEAD' })
    const headOid = commits[0].oid
    const olderOid = commits[2].oid
    const result = await aheadBehind({ fs, gitdir, ourOid: olderOid, theirOid: headOid })
    expect(result.ahead).toBe(0)
    expect(result.behind).toBe(2)
  })
})
