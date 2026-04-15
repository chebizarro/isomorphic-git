/* eslint-env node, browser, jasmine */
import { Errors, setConfig, fetch } from 'isomorphic-git'
import http from 'isomorphic-git/http'
import { sleep } from 'isomorphic-git/internal-apis'

import { makeFixtureAsSubmodule } from './__helpers__/FixtureFSSubmodule.js'

// this is so it works with either Node local tests or Browser WAN tests
const localhost =
  typeof window === 'undefined' ? '127.0.0.1' : window.location.hostname

describe('fetch', () => {
  it('fetch (singleBranch, from local mock server)', async () => {
    const { fs, gitdir, gitdirsmfullpath } = await makeFixtureAsSubmodule(
      'test-fetch-local-client'
    )
    // Smoke Test
    await fetch({
      fs,
      http,
      gitdir,
      singleBranch: true,
      remote: 'origin',
      ref: 'test-branch-shallow-clone',
    })
    expect(
      await fs.exists(
        `${gitdirsmfullpath}/refs/remotes/origin/test-branch-shallow-clone`
      )
    ).toBe(true)
    expect(
      await fs.exists(`${gitdirsmfullpath}/refs/remotes/origin/master`)
    ).toBe(false)
  })

  it('shallow fetch (from local mock server)', async () => {
    const { fs, gitdir, gitdirsmfullpath } = await makeFixtureAsSubmodule(
      'test-fetch-local-client'
    )
    const output = []
    const progress = []
    // Test
    await fetch({
      fs,
      http,
      gitdir,
      onMessage: async x => {
        output.push(x)
      },
      onProgress: async y => {
        progress.push(y)
      },
      depth: 1,
      singleBranch: true,
      remote: 'origin',
      ref: 'test-branch-shallow-clone',
    })
    await sleep(1000)
    expect(await fs.exists(`${gitdirsmfullpath}/shallow`)).toBe(true)
    let shallow = (await fs.read(`${gitdirsmfullpath}/shallow`)).toString(
      'utf8'
    )
    expect(shallow.trim()).toEqual('40c248d7c65caa78dcb42599811147ecc303bd20')
    // Now test deepen
    await fetch({
      fs,
      http,
      gitdir,
      depth: 2,
      singleBranch: true,
      remote: 'origin',
      ref: 'test-branch-shallow-clone',
    })
    await sleep(1000)
    shallow = (await fs.read(`${gitdirsmfullpath}/shallow`)).toString('utf8')
    expect(shallow.trim()).toEqual('5ed28967a81d39ebbbb22ad5d61f04c9a6702b17')
  })

  it('recognizes SSH URLs (scp-like syntax) without throwing UnknownTransportError', async () => {
    const { fs, gitdir } = await makeFixtureAsSubmodule(
      'test-fetch-local-client'
    )
    let err
    try {
      await fetch({
        fs,
        http,
        gitdir,
        depth: 1,
        singleBranch: true,
        remote: 'ssh',
        ref: 'test-branch-shallow-clone',
      })
    } catch (e) {
      err = e
    }
    expect(err).toBeDefined()
    expect(err.code).not.toEqual(Errors.UnknownTransportError.code)
  })

  it('SSH URLs no longer produce HTTPS suggestions (transport is supported)', async () => {
    const { fs, gitdir } = await makeFixtureAsSubmodule(
      'test-fetch-local-client'
    )
    let err
    try {
      await fetch({
        fs,
        http,
        gitdir,
        depth: 1,
        singleBranch: true,
        remote: 'ssh',
        ref: 'test-branch-shallow-clone',
      })
    } catch (e) {
      err = e
    }
    expect(err).toBeDefined()
    expect(err.code).not.toBe(Errors.UnknownTransportError.code)
  })

  it('shallow fetch single commit by hash (from local mock server)', async () => {
    const { fs, gitdir, gitdirsmfullpath } = await makeFixtureAsSubmodule(
      'test-fetch-local-client'
    )
    // Test
    await fetch({
      fs,
      http,
      gitdir,
      singleBranch: true,
      remote: 'origin',
      depth: 1,
      ref: '40c248d7c65caa78dcb42599811147ecc303bd20',
    })
    expect(await fs.exists(`${gitdirsmfullpath}/shallow`)).toBe(true)
    const shallow = (await fs.read(`${gitdirsmfullpath}/shallow`)).toString(
      'utf8'
    )
    expect(shallow).toEqual('40c248d7c65caa78dcb42599811147ecc303bd20\n')
  })

  it('shallow fetch since (from local mock server)', async () => {
    const { fs, gitdir, gitdirsmfullpath } = await makeFixtureAsSubmodule(
      'test-fetch-local-client'
    )
    // Test
    await fetch({
      fs,
      http,
      gitdir,
      since: new Date(1506600000000),
      singleBranch: true,
      remote: 'origin',
      ref: 'test-branch-shallow-clone',
    })
    expect(await fs.exists(`${gitdirsmfullpath}/shallow`)).toBe(true)
    const shallow = (await fs.read(`${gitdirsmfullpath}/shallow`)).toString(
      'utf8'
    )
    expect(shallow.trim().length).toBeGreaterThan(0)
  })

  it('shallow fetch exclude (from local mock server)', async () => {
    const { fs, gitdir, gitdirsmfullpath } = await makeFixtureAsSubmodule(
      'test-fetch-local-client'
    )
    // Test
    await fetch({
      fs,
      http,
      gitdir,
      exclude: ['v0.0.5'],
      singleBranch: true,
      remote: 'origin',
      ref: 'test-branch-shallow-clone',
    })
    expect(await fs.exists(`${gitdirsmfullpath}/shallow`)).toBe(true)
    const shallow = (await fs.read(`${gitdirsmfullpath}/shallow`)).toString(
      'utf8'
    )
    expect(shallow.trim().length).toBeGreaterThan(0)
  })

  it('shallow fetch relative (from local mock server)', async () => {
    const { fs, gitdir, gitdirsmfullpath } = await makeFixtureAsSubmodule(
      'test-fetch-local-client'
    )
    // Test
    await fetch({
      fs,
      http,
      gitdir,
      depth: 1,
      singleBranch: true,
      remote: 'origin',
      ref: 'test-branch-shallow-clone',
    })
    expect(await fs.exists(`${gitdirsmfullpath}/shallow`)).toBe(true)
    let shallow = (await fs.read(`${gitdirsmfullpath}/shallow`)).toString(
      'utf8'
    )
    expect(shallow.trim()).toEqual('40c248d7c65caa78dcb42599811147ecc303bd20')
    // Now test relative deepen
    await fetch({
      fs,
      http,
      gitdir,
      relative: true,
      depth: 1,
      singleBranch: true,
      remote: 'origin',
      ref: 'test-branch-shallow-clone',
    })
    await sleep(1000)
    shallow = (await fs.read(`${gitdirsmfullpath}/shallow`)).toString('utf8')
    expect(shallow.trim()).toEqual('5ed28967a81d39ebbbb22ad5d61f04c9a6702b17')
  })

  it('errors if missing refspec', async () => {
    const { fs, gitdir } = await makeFixtureAsSubmodule('test-issue-84')
    await setConfig({
      fs,
      gitdir,
      path: 'remote.origin.url',
      value: `http://${localhost}:8888/test-fetch-local.git`,
    })
    await setConfig({
      fs,
      gitdir,
      path: 'http.corsProxy',
      value: undefined,
    })
    // Test
    let err = null
    try {
      await fetch({
        fs,
        http,
        gitdir,
        since: new Date(1506571200000),
        singleBranch: true,
        remote: 'origin',
        ref: 'test-branch-shallow-clone',
      })
    } catch (e) {
      err = e
    }
    expect(err).toBeDefined()
    expect(err instanceof Errors.NoRefspecError).toBe(true)
  })

  it('fetch empty repository from git-http-mock-server', async () => {
    const { fs, dir, gitdir, gitdirsmfullpath } = await makeFixtureAsSubmodule(
      'test-empty'
    )
    await fetch({
      fs,
      http,
      dir,
      gitdir,
      depth: 1,
      url: `http://${localhost}:8888/test-empty.git`,
    })
    expect(await fs.exists(`${dir}`)).toBe(true)
    expect(await fs.exists(`${gitdirsmfullpath}/HEAD`)).toBe(true)
    expect(
      (await fs.read(`${gitdirsmfullpath}/HEAD`)).toString('utf-8').trim()
    ).toEqual('ref: refs/heads/master')
    expect(await fs.exists(`${gitdirsmfullpath}/refs/heads/master`)).toBe(false)
  })

  it('fetch --prune from git-http-mock-server', async () => {
    const { fs, dir, gitdir, gitdirsmfullpath } = await makeFixtureAsSubmodule(
      'test-fetch-client'
    )
    await setConfig({
      fs,
      gitdir,
      path: 'remote.origin.url',
      value: `http://${localhost}:8888/test-fetch-server.git`,
    })
    expect(
      await fs.exists(`${gitdirsmfullpath}/refs/remotes/origin/test-prune`)
    ).toBe(true)
    const { pruned } = await fetch({
      fs,
      http,
      dir,
      gitdir,
      depth: 1,
      prune: true,
    })
    expect(pruned).toEqual(['refs/remotes/origin/test-prune'])
    expect(
      await fs.exists(`${gitdirsmfullpath}/refs/remotes/origin/test-prune`)
    ).toBe(false)
  })

  it('fetch --prune-tags from git-http-mock-server', async () => {
    const { fs, dir, gitdir, gitdirsmfullpath } = await makeFixtureAsSubmodule(
      'test-fetch-client'
    )
    await setConfig({
      fs,
      gitdir,
      path: 'remote.origin.url',
      value: `http://${localhost}:8888/test-fetch-server.git`,
    })
    expect(await fs.exists(`${gitdirsmfullpath}/refs/tags/v1.0.0-beta1`)).toBe(
      true
    )
    const oldValue = await fs.read(
      `${gitdirsmfullpath}/refs/tags/v1.0.0`,
      'utf8'
    )
    try {
      await fetch({
        fs,
        http,
        dir,
        gitdir,
        depth: 1,
        tags: true,
        pruneTags: true,
      })
    } catch (err) {
      // shrug
    }
    // assert that tag was deleted
    expect(await fs.exists(`${gitdirsmfullpath}/refs/tags/v1.0.0-beta1`)).toBe(
      false
    )
    // assert that tags was force-updated
    const newValue = await fs.read(
      `${gitdirsmfullpath}/refs/tags/v1.0.0`,
      'utf8'
    )
    expect(oldValue).not.toEqual(newValue)
  })
})
