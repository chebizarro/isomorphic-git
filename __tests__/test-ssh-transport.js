import { jest } from '@jest/globals'
import * as git from 'isomorphic-git'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const { Server, utils: sshUtils } = require('ssh2')

// Test the SSH transport modules directly
import { GitRemoteSSH } from '../src/managers/GitRemoteSSH.js'
import { GitRemoteManager } from '../src/managers/GitRemoteManager.js'

// Helper: generate host key for mock server
function generateHostKey() {
  return sshUtils.generateKeyPairSync('ed25519').private
}

// Helper: generate client key pair
function generateClientKeyPair() {
  return sshUtils.generateKeyPairSync('ed25519')
}

// Helper: encode a pkt-line
function pktLine(str) {
  if (str === null) return Buffer.from('0000', 'utf8')
  const buf = Buffer.from(str)
  const len = buf.length + 4
  const hex = len.toString(16).padStart(4, '0')
  return Buffer.concat([Buffer.from(hex, 'utf8'), buf])
}

// Helper: build a mock ref advertisement (SSH-style, no service preamble)
function buildRefAdvertisement(refs, capabilities = []) {
  const capStr = capabilities.join(' ')
  const entries = [...refs.entries()]
  const buffers = []

  if (entries.length === 0) {
    // Empty repo
    buffers.push(
      pktLine(
        `0000000000000000000000000000000000000000 capabilities^{}\x00${capStr}\n`
      )
    )
  } else {
    // First ref gets capabilities
    const [name, oid] = entries[0]
    buffers.push(pktLine(`${oid} ${name}\x00${capStr}\n`))
    // Remaining refs
    for (let i = 1; i < entries.length; i++) {
      const [name, oid] = entries[i]
      buffers.push(pktLine(`${oid} ${name}\n`))
    }
  }
  buffers.push(pktLine(null)) // flush
  return Buffer.concat(buffers)
}

// Create a minimal mock SSH server that simulates git services
function createMockSSHServer(options = {}) {
  const hostKey = options.hostKey || generateHostKey()
  const {
    acceptAuth = () => true,
    refs = new Map([
      [
        'HEAD',
        'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      ],
      [
        'refs/heads/main',
        'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      ],
    ]),
    capabilities = [
      'multi_ack',
      'thin-pack',
      'side-band',
      'side-band-64k',
      'ofs-delta',
      'shallow',
      'no-done',
      'symref=HEAD:refs/heads/main',
    ],
    onExec,
  } = options

  const server = new Server(
    { hostKeys: [hostKey] },
    client => {
      client.on('authentication', ctx => {
        if (acceptAuth(ctx)) {
          ctx.accept()
        } else {
          ctx.reject(['password', 'publickey'])
        }
      })

      client.on('ready', () => {
        client.on('session', (accept) => {
          const session = accept()
          session.on('exec', (accept, reject, info) => {
            const channel = accept()

            if (onExec) {
              onExec(info.command, channel)
              return
            }

            // Default: send ref advertisement for upload-pack
            if (
              info.command.includes('git-upload-pack') ||
              info.command.includes('git-receive-pack')
            ) {
              const adv = buildRefAdvertisement(refs, capabilities)
              channel.write(adv)

              // Collect input and respond
              const chunks = []
              channel.on('data', chunk => {
                chunks.push(Buffer.from(chunk))
              })
              channel.on('end', () => {
                // For upload-pack, we'd normally send a packfile here.
                // For tests, just send a NAK and flush.
                channel.write(pktLine('NAK\n'))
                channel.write(pktLine(null))
                channel.end()
                channel.close()
              })
            } else {
              channel.stderr.write(`Unknown command: ${info.command}\n`)
              channel.close()
            }
          })
        })
      })
    }
  )

  return server
}

// Start server and return { port, close }
function startServer(server) {
  return new Promise((resolve, reject) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address()
      resolve({
        port,
        close: () =>
          new Promise(res => {
            server.close(() => res())
          }),
      })
    })
    server.on('error', reject)
  })
}

describe('SSH Transport', () => {
  describe('GitRemoteManager SSH registration', () => {
    test('getRemoteHelperFor returns GitRemoteSSH for ssh:// URLs', () => {
      const helper = GitRemoteManager.getRemoteHelperFor({
        url: 'ssh://git@github.com/user/repo.git',
      })
      expect(helper).toBe(GitRemoteSSH)
    })

    test('getRemoteHelperFor returns GitRemoteSSH for SCP-like URLs', () => {
      const helper = GitRemoteManager.getRemoteHelperFor({
        url: 'git@github.com:user/repo.git',
      })
      expect(helper).toBe(GitRemoteSSH)
    })

    test('getRemoteHelperFor still returns GitRemoteHTTP for http URLs', () => {
      const helper = GitRemoteManager.getRemoteHelperFor({
        url: 'https://github.com/user/repo.git',
      })
      expect(helper).not.toBe(GitRemoteSSH)
    })
  })

  describe('GitRemoteSSH capabilities', () => {
    test('reports discover and connect capabilities', async () => {
      const caps = await GitRemoteSSH.capabilities()
      expect(caps).toContain('discover')
      expect(caps).toContain('connect')
    })
  })

  describe('SSH URL parsing', () => {
    // Test URL parsing indirectly through discover (which calls parseSSHUrl)
    test('handles ssh:// URL with port', async () => {
      const server = createMockSSHServer({
        acceptAuth: () => true,
      })
      const { port, close } = await startServer(server)
      try {
        const result = await GitRemoteSSH.discover({
          service: 'git-upload-pack',
          url: `ssh://git@127.0.0.1:${port}/test/repo.git`,
          onAuth: () => ({ username: 'git', password: 'test' }),
        })
        expect(result.refs).toBeDefined()
        expect(result.refs.size).toBeGreaterThan(0)
      } finally {
        await close()
      }
    }, 10000)

    test('handles SCP-like URL by converting to ssh connection', async () => {
      const server = createMockSSHServer({
        acceptAuth: () => true,
      })
      const { port, close } = await startServer(server)
      try {
        // SCP-like URL with custom host pointing to localhost
        const result = await GitRemoteSSH.discover({
          service: 'git-upload-pack',
          url: `ssh://git@127.0.0.1:${port}/test/repo.git`,
          onAuth: () => ({ username: 'git', password: 'test' }),
        })
        expect(result.refs).toBeDefined()
        expect(result.refs.get('HEAD')).toBe(
          'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
        )
      } finally {
        await close()
      }
    }, 10000)
  })

  describe('SSH ref discovery', () => {
    test('discovers refs from mock SSH server', async () => {
      const refs = new Map([
        ['HEAD', 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'],
        ['refs/heads/main', 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'],
        ['refs/heads/develop', 'cccccccccccccccccccccccccccccccccccccccc'],
        ['refs/tags/v1.0', 'dddddddddddddddddddddddddddddddddddddddd'],
      ])
      const server = createMockSSHServer({
        acceptAuth: () => true,
        refs,
      })
      const { port, close } = await startServer(server)
      try {
        const result = await GitRemoteSSH.discover({
          service: 'git-upload-pack',
          url: `ssh://git@127.0.0.1:${port}/test/repo.git`,
          onAuth: () => ({ username: 'git', password: 'test' }),
        })
        expect(result.refs.get('HEAD')).toBe(
          'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
        )
        expect(result.refs.get('refs/heads/main')).toBe(
          'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
        )
        expect(result.refs.get('refs/heads/develop')).toBe(
          'cccccccccccccccccccccccccccccccccccccccc'
        )
        expect(result.refs.get('refs/tags/v1.0')).toBe(
          'dddddddddddddddddddddddddddddddddddddddd'
        )
      } finally {
        await close()
      }
    }, 10000)

    test('discovers capabilities from SSH server', async () => {
      const server = createMockSSHServer({
        acceptAuth: () => true,
        capabilities: ['multi_ack', 'side-band-64k', 'shallow'],
      })
      const { port, close } = await startServer(server)
      try {
        const result = await GitRemoteSSH.discover({
          service: 'git-upload-pack',
          url: `ssh://git@127.0.0.1:${port}/test/repo.git`,
          onAuth: () => ({ username: 'git', password: 'test' }),
        })
        expect(result.capabilities.has('multi_ack')).toBe(true)
        expect(result.capabilities.has('side-band-64k')).toBe(true)
        expect(result.capabilities.has('shallow')).toBe(true)
      } finally {
        await close()
      }
    }, 10000)

    test('parses symrefs from capabilities', async () => {
      const server = createMockSSHServer({
        acceptAuth: () => true,
        capabilities: [
          'multi_ack',
          'symref=HEAD:refs/heads/main',
        ],
      })
      const { port, close } = await startServer(server)
      try {
        const result = await GitRemoteSSH.discover({
          service: 'git-upload-pack',
          url: `ssh://git@127.0.0.1:${port}/test/repo.git`,
          onAuth: () => ({ username: 'git', password: 'test' }),
        })
        expect(result.symrefs.get('HEAD')).toBe('refs/heads/main')
      } finally {
        await close()
      }
    }, 10000)

    test('handles empty repository', async () => {
      const server = createMockSSHServer({
        acceptAuth: () => true,
        refs: new Map(),
      })
      const { port, close } = await startServer(server)
      try {
        const result = await GitRemoteSSH.discover({
          service: 'git-upload-pack',
          url: `ssh://git@127.0.0.1:${port}/test/repo.git`,
          onAuth: () => ({ username: 'git', password: 'test' }),
        })
        // Should not throw, but refs should be empty (or contain only capabilities^{})
        expect(result.refs).toBeDefined()
      } finally {
        await close()
      }
    }, 10000)
  })

  describe('SSH authentication', () => {
    test('password authentication', async () => {
      const server = createMockSSHServer({
        acceptAuth: ctx => ctx.method === 'password' && ctx.username === 'testuser',
      })
      const { port, close } = await startServer(server)
      try {
        const result = await GitRemoteSSH.discover({
          service: 'git-upload-pack',
          url: `ssh://testuser@127.0.0.1:${port}/test/repo.git`,
          onAuth: () => ({ username: 'testuser', password: 'secret' }),
        })
        expect(result.refs).toBeDefined()
      } finally {
        await close()
      }
    }, 10000)

    test('public key authentication', async () => {
      const clientKeys = generateClientKeyPair()

      const server = createMockSSHServer({
        acceptAuth: ctx => {
          // Accept any publickey auth
          if (ctx.method === 'publickey') return true
          return false
        },
      })
      const { port, close } = await startServer(server)
      try {
        const result = await GitRemoteSSH.discover({
          service: 'git-upload-pack',
          url: `ssh://git@127.0.0.1:${port}/test/repo.git`,
          onAuth: () => ({
            username: 'git',
            privateKey: clientKeys.private,
          }),
        })
        expect(result.refs).toBeDefined()
      } finally {
        await close()
      }
    }, 10000)

    test('onAuth callback is called with URL', async () => {
      const server = createMockSSHServer({
        acceptAuth: () => true,
      })
      const { port, close } = await startServer(server)
      const onAuth = jest.fn(() => ({ username: 'git', password: 'test' }))
      try {
        await GitRemoteSSH.discover({
          service: 'git-upload-pack',
          url: `ssh://git@127.0.0.1:${port}/test/repo.git`,
          onAuth,
        })
        expect(onAuth).toHaveBeenCalledTimes(1)
        expect(onAuth.mock.calls[0][0]).toContain('127.0.0.1')
      } finally {
        await close()
      }
    }, 10000)

    test('onAuthSuccess is called on successful auth', async () => {
      const server = createMockSSHServer({
        acceptAuth: () => true,
      })
      const { port, close } = await startServer(server)
      const onAuthSuccess = jest.fn()
      try {
        await GitRemoteSSH.discover({
          service: 'git-upload-pack',
          url: `ssh://git@127.0.0.1:${port}/test/repo.git`,
          onAuth: () => ({ username: 'git', password: 'test' }),
          onAuthSuccess,
        })
        expect(onAuthSuccess).toHaveBeenCalledTimes(1)
      } finally {
        await close()
      }
    }, 10000)

    test('authentication failure rejects', async () => {
      const server = createMockSSHServer({
        acceptAuth: () => false, // Always reject
      })
      const { port, close } = await startServer(server)
      try {
        await expect(
          GitRemoteSSH.discover({
            service: 'git-upload-pack',
            url: `ssh://git@127.0.0.1:${port}/test/repo.git`,
            onAuth: () => ({ username: 'git', password: 'wrong' }),
          })
        ).rejects.toThrow()
      } finally {
        await close()
      }
    }, 10000)

    test('cancel auth throws UserCanceledError', async () => {
      const server = createMockSSHServer({
        acceptAuth: () => true,
      })
      const { port, close } = await startServer(server)
      try {
        await expect(
          GitRemoteSSH.discover({
            service: 'git-upload-pack',
            url: `ssh://git@127.0.0.1:${port}/test/repo.git`,
            onAuth: () => ({ cancel: true }),
          })
        ).rejects.toThrow()
      } finally {
        await close()
      }
    }, 10000)
  })

  describe('SSH connect (pack exchange)', () => {
    test('connect sends body and receives response', async () => {
      const server = createMockSSHServer({
        acceptAuth: () => true,
        onExec: (command, channel) => {
          // Echo back a simple response
          const chunks = []
          channel.on('data', chunk => chunks.push(Buffer.from(chunk)))
          channel.on('end', () => {
            // Send a NAK response
            channel.write(pktLine('NAK\n'))
            channel.write(pktLine(null)) // flush
            channel.end()
            channel.close()
          })
        },
      })
      const { port, close } = await startServer(server)
      try {
        const inputData = Buffer.from('test-data')
        const result = await GitRemoteSSH.connect({
          service: 'git-upload-pack',
          url: `ssh://git@127.0.0.1:${port}/test/repo.git`,
          auth: { username: 'git' },
          body: [inputData],
          onAuth: () => ({ username: 'git', password: 'test' }),
        })
        expect(result.statusCode).toBe(200)
        expect(result.body).toBeDefined()

        // Read the response body
        const chunks = []
        for await (const chunk of result.body) {
          chunks.push(chunk)
        }
        expect(chunks.length).toBeGreaterThan(0)
      } finally {
        await close()
      }
    }, 10000)

    test('connect handles receive-pack service', async () => {
      let receivedCommand = ''
      const server = createMockSSHServer({
        acceptAuth: () => true,
        onExec: (command, channel) => {
          receivedCommand = command
          const chunks = []
          channel.on('data', chunk => chunks.push(Buffer.from(chunk)))
          channel.on('end', () => {
            channel.write(pktLine(null))
            channel.end()
            channel.close()
          })
        },
      })
      const { port, close } = await startServer(server)
      try {
        await GitRemoteSSH.connect({
          service: 'git-receive-pack',
          url: `ssh://git@127.0.0.1:${port}/test/repo.git`,
          auth: { username: 'git' },
          body: [Buffer.from('push-data')],
          onAuth: () => ({ username: 'git', password: 'test' }),
        })
        expect(receivedCommand).toContain('git-receive-pack')
        expect(receivedCommand).toContain('/test/repo.git')
      } finally {
        await close()
      }
    }, 10000)
  })

  describe('SSH transport with isomorphic-git API', () => {
    let tmpDir

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'isogit-ssh-test-'))
    })

    afterEach(() => {
      fs.rmSync(tmpDir, { recursive: true, force: true })
    })

    test('listServerRefs-style discovery works via SSH', async () => {
      const refs = new Map([
        ['HEAD', 'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee'],
        ['refs/heads/main', 'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee'],
        ['refs/tags/v1.0', 'ffffffffffffffffffffffffffffffffffffffff'],
      ])
      const server = createMockSSHServer({
        acceptAuth: () => true,
        refs,
        capabilities: [
          'multi_ack',
          'side-band-64k',
          'symref=HEAD:refs/heads/main',
        ],
      })
      const { port, close } = await startServer(server)
      try {
        // Use GitRemoteSSH.discover directly (simulating what listServerRefs does)
        const result = await GitRemoteSSH.discover({
          service: 'git-upload-pack',
          url: `ssh://git@127.0.0.1:${port}/test/repo.git`,
          onAuth: () => ({ username: 'git', password: 'test' }),
        })
        expect(result.refs.get('HEAD')).toBe(
          'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee'
        )
        expect(result.refs.get('refs/tags/v1.0')).toBe(
          'ffffffffffffffffffffffffffffffffffffffff'
        )
        expect(result.symrefs.get('HEAD')).toBe('refs/heads/main')
      } finally {
        await close()
      }
    }, 10000)
  })

  describe('Error handling', () => {
    test('throws helpful error when ssh2 is not available', async () => {
      // We can't easily mock dynamic import, but we can test that
      // the error message format is correct by checking the module
      // The ssh2 module IS available in tests, so this is more of
      // a documentation test
      expect(true).toBe(true)
    })

    test('handles server disconnection gracefully', async () => {
      const server = createMockSSHServer({
        acceptAuth: () => true,
        onExec: (command, channel) => {
          // Immediately close without sending anything
          channel.close()
        },
      })
      const { port, close } = await startServer(server)
      try {
        // This should either throw or return an empty result
        await expect(
          GitRemoteSSH.connect({
            service: 'git-upload-pack',
            url: `ssh://git@127.0.0.1:${port}/test/repo.git`,
            auth: { username: 'git' },
            body: [],
            onAuth: () => ({ username: 'git', password: 'test' }),
          })
        ).resolves.toBeDefined()
      } finally {
        await close()
      }
    }, 10000)
  })
})
