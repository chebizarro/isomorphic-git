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
      /** @type {Map<string, CompatRef>} */
      const refsByName = new Map()

      // 1) Build base refs from remote.refs (single pass, no duplicates)
      for (const [name, oid] of remote.refs) {
        const ref = { name: String(name), oid: String(oid) }
        refs.push(ref)
        refsByName.set(ref.name, ref)
      }

      // 2) Enrich existing refs with symref targets from remote.symrefs
      if (remote.symrefs) {
        for (const [name, target] of remote.symrefs) {
          const ref = refsByName.get(String(name))
          if (!ref) continue
          ref.symbolic = String(target)
        }
      }

      // 3) Enrich existing refs with peeled OIDs from remote.peeled
      if (remote.peeled) {
        for (const [name, peeled] of remote.peeled) {
          const ref = refsByName.get(String(name))
          if (!ref) continue
          ref.peeled = String(peeled)
        }
      }
    } else if (protocol === 'v2') {
      // v2 discovery does not include refs here per public API expectations.
    }

    return { protocol, capabilities, refs }
  },
}
