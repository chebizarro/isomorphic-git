/**
 * SOCKS/HTTP proxy support for dimorphic-git.
 *
 * Creates an http.Agent that tunnels requests through a SOCKS4/4a/5/5h
 * proxy. This is the libgit2 equivalent of `proxy.h` / `git_proxy_options`.
 *
 * Requires the optional peer dependency `socks-proxy-agent`.
 *
 * @module utils/proxy
 */

/**
 * Create a proxy agent from a SOCKS proxy URL.
 *
 * @param {string} proxyUrl - SOCKS proxy URL, e.g. 'socks5://localhost:1080'
 *   Supported protocols: socks4://, socks4a://, socks5://, socks5h://
 *   Username/password auth: socks5://user:pass@host:port
 * @returns {object} An http.Agent that routes traffic through the proxy
 * @throws {Error} If socks-proxy-agent is not installed
 *
 * @example
 * import { createProxyAgent } from 'dimorphic-git'
 * import http from 'dimorphic-git/http/node'
 *
 * const agent = createProxyAgent('socks5://localhost:1080')
 * await git.clone({
 *   fs, http, dir: '/repo',
 *   url: 'https://github.com/user/repo.git',
 *   proxy: agent,
 * })
 */
export async function createProxyAgent(proxyUrl) {
  let SocksProxyAgent
  try {
    const mod = await import('socks-proxy-agent')
    SocksProxyAgent = mod.SocksProxyAgent || (mod.default && mod.default.SocksProxyAgent)
    if (!SocksProxyAgent) throw new Error('SocksProxyAgent not found')
  } catch (e) {
    throw new Error(
      'SOCKS proxy support requires the "socks-proxy-agent" package. ' +
      'Install it with: npm install socks-proxy-agent'
    )
  }
  return new SocksProxyAgent(proxyUrl)
}

/**
 * Resolve a proxy value into an agent.
 *
 * Accepts:
 *   - undefined/null → returns undefined (no proxy)
 *   - string → creates a SocksProxyAgent from the URL
 *   - object → assumed to be an http.Agent, passed through as-is
 *
 * @param {string|object|undefined} proxy
 * @returns {Promise<object|undefined>}
 */
export async function resolveProxy(proxy) {
  if (!proxy) return undefined
  if (typeof proxy === 'string') return createProxyAgent(proxy)
  // Assume it's already an agent object
  return proxy
}
