// Adapter that reuses existing GitRemoteHTTP.discover and maps to compat transport shape.
import { GitRemoteManager } from '../../managers/GitRemoteManager.js'

/**
 * @typedef {Object} CompatRef
 * @property {string} name
 * @property {string} oid
 * @property {string} [peeled]
 * @property {string} [symbolic]
 */

/**
 * @typedef {Object} CompatDiscovery
 * @property {'v1'|'v2'} protocol
 * @property {string[]} capabilities
 * @property {CompatRef[]} refs
 */

export const httpTransport = {
  /**
   * @param {string} url
   * @param {object} [opts]
   * @returns {Promise<CompatDiscovery>}
   */
  async discover(url, opts = {}) {
    const GitRemoteHTTP = GitRemoteManager.getRemoteHelperFor({ url })
    const remote = await GitRemoteHTTP.discover({
      http: opts.http,
      onAuth: opts.onAuth,
      onAuthSuccess: opts.onAuthSuccess,
      onAuthFailure: opts.onAuthFailure,
      corsProxy: opts.corsProxy,
      service: opts.forPush ? 'git-receive-pack' : 'git-upload-pack',
      url,
      headers: opts.headers || {},
      protocolVersion: opts.protocolVersion || 2,
    })

    // Map legacy remote to compat discovery shape
    /** @type {'v1'|'v2'} */
    const protocol = remote.protocolVersion === 2 ? 'v2' : 'v1'
    /** @type {string[]} */
    const capabilities =
      protocol === 'v2'
        ? Object.entries(remote.capabilities2 || {}).map(([k, v]) =>
            v === true ? k : `${k}=${v}`
          )
        : Array.from(remote.capabilities || [])

    /** @type {CompatRef[]} */
    const refs = []
    if (protocol === 'v1' && remote.refs) {
      for (const [ref, oid] of remote.refs) {
        refs.push({ name: ref, oid })
      }
      // symrefs map if available
      if (remote.symrefs) {
        for (const [sym, target] of remote.symrefs) {
          refs.push({
            name: sym,
            oid: '0000000000000000000000000000000000000000',
            symbolic: target,
          })
        }
      }
      // peeled map if available
      if (remote.peeled) {
        for (const [ref, peeled] of remote.peeled) {
          {
            const baseOid = remote.refs.get(ref)
            // Only include peeled when baseOid exists and peeled is a string
            refs.push({ name: ref, oid: String(baseOid), peeled: String(peeled) })
          }
        }
      }
    } else if (protocol === 'v2') {
      // v2 discovery does not include refs here per public API expectations.
    }

    return { protocol, capabilities, refs }
  },
}
