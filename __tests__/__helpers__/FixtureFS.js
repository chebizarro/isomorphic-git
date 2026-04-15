/* eslint-env node, browser, jasmine, jest */

import { makeLightningFS } from './FixtureFS/makeLightningFS.js'
import { makeNodeFixture } from './FixtureFS/makeNodeFixture.js'
import { makeZenFS } from './FixtureFS/makeZenFS.js'

if (typeof jest !== 'undefined') {
  // Only fake Date so commit timestamps are deterministic.
  // Do NOT fake setTimeout/setInterval — Node.js HTTP internals
  // (TLS handshake, keep-alive, socket timeouts) depend on real timers
  // and faking them causes network requests to hang or time out.
  jest.useFakeTimers({ doNotFake: [
    'setTimeout',
    'clearTimeout',
    'setImmediate',
    'clearImmediate',
    'setInterval',
    'clearInterval',
  ] })
  jest.setTimeout(120000)
}

if (typeof jasmine !== 'undefined') jasmine.DEFAULT_TIMEOUT_INTERVAL = 60000

export async function makeFixture(dir) {
  return process.browser ? makeBrowserFixture(dir) : makeNodeFixture(dir)
}

async function makeBrowserFixture(dir) {
  // enable / disable console.log statements
  // window.localStorage.debug = 'isomorphic-git'
  const isSafari = /Safari/.test(navigator && navigator.userAgent)
  return process.env.ENABLE_LIGHTNINGFS && !isSafari
    ? makeLightningFS(dir)
    : makeZenFS(dir)
}
