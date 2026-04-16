/* eslint-env node, browser, jasmine */
import { fetch, push } from 'dimorphic-git'
import http from 'dimorphic-git/http'

import { makeFixtureAsSubmodule } from './__helpers__/FixtureFSSubmodule.js'

// this is so it works with either Node local tests or Browser WAN tests
const localhost =
  typeof window === 'undefined' ? '127.0.0.1' : window.location.hostname

// These tests validate fetch/push in a submodule context against the local
// git-http-mock-server, instead of hitting real external hosting providers.

describe('Hosting Providers', () => {
  describe('fetch and push via HTTP transport (submodule)', () => {
    it('fetch from local mock server', async () => {
      const { fs, gitdir } = await makeFixtureAsSubmodule(
        'test-hosting-local-client'
      )
      const res = await fetch({
        fs,
        http,
        gitdir,
        remote: 'provider1',
        ref: 'master',
      })
      expect(res).toBeTruthy()
      expect(res.defaultBranch).toBe('refs/heads/master')
      expect(res.fetchHead).toBeTruthy()
      expect(typeof res.fetchHead).toBe('string')
      expect(res.fetchHead.length).toBe(40)
    })

    it('fetch with onAuth callback', async () => {
      const { fs, gitdir } = await makeFixtureAsSubmodule(
        'test-hosting-local-client'
      )
      const res = await fetch({
        fs,
        http,
        gitdir,
        remote: 'provider1',
        ref: 'master',
        onAuth: () => ({ username: 'testuser', password: 'testpass' }),
      })
      expect(res).toBeTruthy()
      expect(res.fetchHead).toBeTruthy()
    })

    it('push to local mock server', async () => {
      const { fs, gitdir } = await makeFixtureAsSubmodule(
        'test-hosting-local-client'
      )
      const res = await push({
        fs,
        http,
        gitdir,
        remote: 'provider1',
        ref: 'master',
        force: true,
      })
      expect(res).toBeTruthy()
      expect(res.ok).toBe(true)
      expect(res.refs['refs/heads/master'].ok).toBe(true)
    })

    it('push with onAuth callback', async () => {
      const { fs, gitdir } = await makeFixtureAsSubmodule(
        'test-hosting-local-client'
      )
      const res = await push({
        fs,
        http,
        gitdir,
        remote: 'provider2',
        ref: 'master',
        force: true,
        onAuth: () => ({ username: 'testuser', password: 'testpass' }),
      })
      expect(res).toBeTruthy()
      expect(res.ok).toBe(true)
    })

    it('fetch multiple remotes (simulating multiple providers)', async () => {
      const { fs, gitdir } = await makeFixtureAsSubmodule(
        'test-hosting-local-client'
      )
      // Fetch from provider1
      const res1 = await fetch({
        fs,
        http,
        gitdir,
        remote: 'provider1',
        ref: 'master',
      })
      expect(res1).toBeTruthy()
      expect(res1.fetchHead).toBeTruthy()

      // Fetch from provider2 (same server, different remote name)
      const res2 = await fetch({
        fs,
        http,
        gitdir,
        remote: 'provider2',
        ref: 'master',
      })
      expect(res2).toBeTruthy()
      expect(res2.fetchHead).toBeTruthy()

      // Both should return the same commit
      expect(res1.fetchHead).toEqual(res2.fetchHead)
    })
  })
})
