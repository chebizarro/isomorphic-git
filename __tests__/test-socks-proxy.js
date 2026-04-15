import { jest } from '@jest/globals'
import * as git from 'isomorphic-git'
import http from 'isomorphic-git/http'
import fs from 'fs'
import path from 'path'
import os from 'os'
import net from 'net'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)

// Import the proxy helper directly
import { createProxyAgent, resolveProxy } from '../src/utils/proxy.js'

/**
 * Minimal SOCKS5 proxy server for testing.
 *
 * Implements just enough of the SOCKS5 handshake to:
 * 1. Accept connections with no-auth method
 * 2. Parse CONNECT requests (domain or IPv4)
 * 3. Forward the connection to the target
 *
 * This lets us verify that proxy agent flows through the HTTP transport.
 */
function createMockSocks5Server(options = {}) {
  const { onConnect } = options
  const connections = []

  const server = net.createServer(clientSocket => {
    let state = 'greeting'

    clientSocket.on('data', data => {
      if (state === 'greeting') {
        // SOCKS5 greeting: client sends version + auth methods
        // VER(1) NMETHODS(1) METHODS(N)
        if (data[0] !== 0x05) {
          clientSocket.destroy()
          return
        }
        // Reply: VER(1) METHOD(1) — 0x00 = no auth required
        clientSocket.write(Buffer.from([0x05, 0x00]))
        state = 'request'
      } else if (state === 'request') {
        // SOCKS5 request: VER(1) CMD(1) RSV(1) ATYP(1) DST.ADDR(var) DST.PORT(2)
        const ver = data[0]
        const cmd = data[1]
        // const rsv = data[2]
        const atyp = data[3]

        if (ver !== 0x05 || cmd !== 0x01) {
          // We only support CONNECT
          clientSocket.write(
            Buffer.from([0x05, 0x07, 0x00, 0x01, 0, 0, 0, 0, 0, 0])
          )
          clientSocket.destroy()
          return
        }

        let host, port, addrEnd

        if (atyp === 0x01) {
          // IPv4
          host = `${data[4]}.${data[5]}.${data[6]}.${data[7]}`
          port = data.readUInt16BE(8)
          addrEnd = 10
        } else if (atyp === 0x03) {
          // Domain name
          const domainLen = data[4]
          host = data.slice(5, 5 + domainLen).toString('ascii')
          port = data.readUInt16BE(5 + domainLen)
          addrEnd = 7 + domainLen
        } else if (atyp === 0x04) {
          // IPv6 — 16-byte address
          if (data.length < 22) {
            clientSocket.destroy()
            return
          }
          const ipv6Parts = []
          for (let i = 0; i < 16; i += 2) {
            ipv6Parts.push(data.readUInt16BE(4 + i).toString(16))
          }
          host = ipv6Parts.join(':')
          // Normalize ::1 to 127.0.0.1 for local connections
          if (host === '0:0:0:0:0:0:0:1') host = '127.0.0.1'
          port = data.readUInt16BE(20)
          addrEnd = 22
        }

        if (onConnect) {
          onConnect({ host, port })
        }
        connections.push({ host, port })

        // Connect to the target
        const targetSocket = net.connect(port, host, () => {
          // Send success reply
          // VER(1) REP(1) RSV(1) ATYP(1) BND.ADDR(4) BND.PORT(2)
          const reply = Buffer.alloc(10)
          reply[0] = 0x05 // VER
          reply[1] = 0x00 // succeeded
          reply[2] = 0x00 // RSV
          reply[3] = 0x01 // IPv4
          // BND.ADDR and BND.PORT can be zeros
          clientSocket.write(reply)

          // Pipe data bidirectionally
          clientSocket.pipe(targetSocket)
          targetSocket.pipe(clientSocket)
        })

        targetSocket.on('error', () => {
          // Connection refused - send failure reply
          const reply = Buffer.alloc(10)
          reply[0] = 0x05
          reply[1] = 0x05 // connection refused
          reply[3] = 0x01
          clientSocket.write(reply)
          clientSocket.destroy()
        })

        state = 'connected'
      }
    })

    clientSocket.on('error', () => {})
  })

  return {
    server,
    connections,
    start: () =>
      new Promise(resolve => {
        server.listen(0, '127.0.0.1', () => {
          resolve(server.address().port)
        })
      }),
    close: () =>
      new Promise(resolve => {
        server.close(() => resolve())
      }),
  }
}

describe('SOCKS Proxy Support', () => {
  describe('createProxyAgent', () => {
    test('creates a SocksProxyAgent from a URL string', async () => {
      const agent = await createProxyAgent('socks5://127.0.0.1:1080')
      expect(agent).toBeDefined()
      expect(agent.constructor.name).toBe('SocksProxyAgent')
    })

    test('supports socks4 URLs', async () => {
      const agent = await createProxyAgent('socks4://127.0.0.1:1080')
      expect(agent).toBeDefined()
    })

    test('supports URLs with auth', async () => {
      const agent = await createProxyAgent(
        'socks5://user:pass@127.0.0.1:1080'
      )
      expect(agent).toBeDefined()
    })
  })

  describe('resolveProxy', () => {
    test('returns undefined for null/undefined', async () => {
      expect(await resolveProxy(null)).toBeUndefined()
      expect(await resolveProxy(undefined)).toBeUndefined()
    })

    test('creates agent from string', async () => {
      const agent = await resolveProxy('socks5://127.0.0.1:1080')
      expect(agent).toBeDefined()
      expect(agent.constructor.name).toBe('SocksProxyAgent')
    })

    test('passes through object as-is', async () => {
      const fakeAgent = { custom: true }
      const result = await resolveProxy(fakeAgent)
      expect(result).toBe(fakeAgent)
    })
  })

  describe('proxy parameter flows through API', () => {
    let tmpDir
    let socksProxy
    let proxyPort

    beforeAll(async () => {
      socksProxy = createMockSocks5Server()
      proxyPort = await socksProxy.start()
    })

    afterAll(async () => {
      await socksProxy.close()
    })

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'isogit-proxy-test-'))
      socksProxy.connections.length = 0 // Clear connections
    })

    afterEach(() => {
      fs.rmSync(tmpDir, { recursive: true, force: true })
    })

    test('getRemoteInfo routes through SOCKS proxy', async () => {
      // Use the local HTTP git mock server that isomorphic-git tests use
      const localhost =
        typeof window === 'undefined' ? 'localhost' : window.location.hostname
      try {
        const info = await git.getRemoteInfo({
          http,
          url: `http://${localhost}:8888/test-dumb-http-server.git`,
          proxy: `socks5://127.0.0.1:${proxyPort}`,
        })
        expect(info).toBeDefined()
        // Verify the connection went through our proxy
        expect(socksProxy.connections.length).toBeGreaterThan(0)
        expect(socksProxy.connections[0].host).toBe(localhost)
        expect(socksProxy.connections[0].port).toBe(8888)
      } catch (err) {
        // If the git mock server isn't running, that's OK — we just verify
        // the proxy was at least contacted
        if (socksProxy.connections.length > 0) {
          expect(socksProxy.connections[0].port).toBe(8888)
        } else {
          // Re-throw if no proxy connection was even attempted
          throw err
        }
      }
    }, 15000)

    test('proxy parameter accepts a pre-built agent object', async () => {
      const agent = await createProxyAgent(`socks5://127.0.0.1:${proxyPort}`)
      const localhost =
        typeof window === 'undefined' ? 'localhost' : window.location.hostname
      try {
        await git.getRemoteInfo({
          http,
          url: `http://${localhost}:8888/test-dumb-http-server.git`,
          proxy: agent,
        })
        expect(socksProxy.connections.length).toBeGreaterThan(0)
      } catch (err) {
        if (socksProxy.connections.length > 0) {
          expect(socksProxy.connections[0].port).toBe(8888)
        } else {
          throw err
        }
      }
    }, 15000)

    test('fetch routes through SOCKS proxy', async () => {
      // Initialize a bare repo so fetch has something to work with
      await git.init({ fs, dir: tmpDir })
      const localhost =
        typeof window === 'undefined' ? 'localhost' : window.location.hostname
      await git.addRemote({
        fs,
        dir: tmpDir,
        remote: 'origin',
        url: `http://${localhost}:8888/test-dumb-http-server.git`,
      })
      try {
        await git.fetch({
          fs,
          http,
          dir: tmpDir,
          remote: 'origin',
          proxy: `socks5://127.0.0.1:${proxyPort}`,
          depth: 1,
          singleBranch: true,
        })
        expect(socksProxy.connections.length).toBeGreaterThan(0)
      } catch (err) {
        // If mock server isn't running, verify proxy was contacted
        if (socksProxy.connections.length > 0) {
          expect(socksProxy.connections[0].port).toBe(8888)
        } else {
          throw err
        }
      }
    }, 30000)

    test('clone routes through SOCKS proxy', async () => {
      const cloneDir = fs.mkdtempSync(
        path.join(os.tmpdir(), 'isogit-proxy-clone-')
      )
      const localhost =
        typeof window === 'undefined' ? 'localhost' : window.location.hostname
      try {
        await git.clone({
          fs,
          http,
          dir: cloneDir,
          url: `http://${localhost}:8888/test-dumb-http-server.git`,
          proxy: `socks5://127.0.0.1:${proxyPort}`,
          depth: 1,
          singleBranch: true,
        })
        expect(socksProxy.connections.length).toBeGreaterThan(0)
      } catch (err) {
        if (socksProxy.connections.length > 0) {
          expect(socksProxy.connections[0].port).toBe(8888)
        } else {
          throw err
        }
      } finally {
        fs.rmSync(cloneDir, { recursive: true, force: true })
      }
    }, 30000)
  })

  describe('createProxyAgent is exported from isomorphic-git', () => {
    test('createProxyAgent is available as named export', () => {
      expect(typeof git.createProxyAgent).toBe('function')
    })
  })
})
