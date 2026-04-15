/* eslint-env node, browser, jasmine */
import { revparse } from 'isomorphic-git'

import { makeFixture } from './__helpers__/FixtureFS.js'

describe('revparse', () => {
  it('resolves HEAD', async () => {
    const { fs, gitdir } = await makeFixture('test-log')
    const oid = await revparse({ fs, gitdir, spec: 'HEAD' })
    expect(oid).toMatch(/^[0-9a-f]{40}$/)
  })

  it('resolves HEAD~1', async () => {
    const { fs, gitdir } = await makeFixture('test-log')
    const headOid = await revparse({ fs, gitdir, spec: 'HEAD' })
    const parentOid = await revparse({ fs, gitdir, spec: 'HEAD~1' })
    expect(parentOid).toMatch(/^[0-9a-f]{40}$/)
    expect(parentOid).not.toBe(headOid)
  })

  it('resolves HEAD~0 as HEAD itself', async () => {
    const { fs, gitdir } = await makeFixture('test-log')
    const headOid = await revparse({ fs, gitdir, spec: 'HEAD' })
    const sameOid = await revparse({ fs, gitdir, spec: 'HEAD~0' })
    expect(sameOid).toBe(headOid)
  })

  it('resolves HEAD^ (first parent)', async () => {
    const { fs, gitdir } = await makeFixture('test-log')
    const headOid = await revparse({ fs, gitdir, spec: 'HEAD' })
    const parentOid = await revparse({ fs, gitdir, spec: 'HEAD^' })
    expect(parentOid).toMatch(/^[0-9a-f]{40}$/)
    expect(parentOid).not.toBe(headOid)
  })

  it('resolves HEAD^1 same as HEAD^', async () => {
    const { fs, gitdir } = await makeFixture('test-log')
    const p1 = await revparse({ fs, gitdir, spec: 'HEAD^' })
    const p2 = await revparse({ fs, gitdir, spec: 'HEAD^1' })
    expect(p1).toBe(p2)
  })

  it('HEAD~1 equals HEAD^', async () => {
    const { fs, gitdir } = await makeFixture('test-log')
    const tilde = await revparse({ fs, gitdir, spec: 'HEAD~1' })
    const caret = await revparse({ fs, gitdir, spec: 'HEAD^' })
    expect(tilde).toBe(caret)
  })

  it('resolves chained operators HEAD~1~1', async () => {
    const { fs, gitdir } = await makeFixture('test-log')
    const oid = await revparse({ fs, gitdir, spec: 'HEAD~1~1' })
    const oidDirect = await revparse({ fs, gitdir, spec: 'HEAD~2' })
    expect(oid).toBe(oidDirect)
  })

  it('throws on empty spec', async () => {
    const { fs, gitdir } = await makeFixture('test-log')
    await expect(revparse({ fs, gitdir, spec: '' })).rejects.toThrow()
  })

  it('throws when parent index exceeds available parents', async () => {
    const { fs, gitdir } = await makeFixture('test-log')
    await expect(revparse({ fs, gitdir, spec: 'HEAD^5' })).rejects.toThrow()
  })

  it('resolves HEAD^0 (peel) as HEAD', async () => {
    const { fs, gitdir } = await makeFixture('test-log')
    const headOid = await revparse({ fs, gitdir, spec: 'HEAD' })
    const peeled = await revparse({ fs, gitdir, spec: 'HEAD^0' })
    expect(peeled).toBe(headOid)
  })
})
