import '../typedefs.js'

import { UserCanceledError } from '../errors/UserCanceledError.js'
import { parseRefsAdResponse } from '../wire/parseRefsAdResponse.js'

/**
 * Parse an SSH URL into its components.
 *
 * Supports:
 *   ssh://[user@]host[:port]/path
 *   git@host:path  (SCP-like syntax)
 *
 * @param {string} url
 * @returns {{ host: string, port: number, username: string, path: string }}
 */
function parseSSHUrl(url) {
  // ssh:// protocol
  const sshMatch = url.match(/^ssh:\/\/(?:([^@]+)@)?([^:/]+)(?::(\d+))?(\/.*)?$/)
  if (sshMatch) {
    return {
      username: sshMatch[1] || 'git',
      host: sshMatch[2],
      port: sshMatch[3] ? parseInt(sshMatch[3], 10) : 22,
      path: sshMatch[4] || '/',
    }
  }
  // SCP-like: user@host:path
  const scpMatch = url.match(/^(?:([^@]+)@)?([^:]+):(.+)$/)
  if (scpMatch) {
    return {
      username: scpMatch[1] || 'git',
      host: scpMatch[2],
      port: 22,
      path: '/' + scpMatch[3],
    }
  }
  throw new Error(`Cannot parse SSH URL: ${url}`)
}

/**
 * Create an async iterator from an SSH channel stream.
 *
 * @param {import('stream').Readable} stream
 * @returns {AsyncIterableIterator<Buffer>}
 */
function fromStream(stream) {
  let ended = false
  const queue = []
  let defer = {}

  stream.on('data', chunk => {
    queue.push(Buffer.from(chunk))
    if (defer.resolve) {
      defer.resolve({ value: queue.shift(), done: false })
      defer = {}
    }
  })
  stream.on('error', err => {
    if (defer.reject) {
      defer.reject(err)
      defer = {}
    }
  })
  stream.on('end', () => {
    ended = true
    if (defer.resolve) {
      defer.resolve({ done: true })
      defer = {}
    }
  })
  stream.on('close', () => {
    ended = true
    if (defer.resolve) {
      defer.resolve({ done: true })
      defer = {}
    }
  })

  return {
    next() {
      return new Promise((resolve, reject) => {
        if (queue.length > 0) {
          return resolve({ value: queue.shift(), done: false })
        } else if (ended) {
          return resolve({ done: true })
        } else {
          defer = { resolve, reject }
        }
      })
    },
    return() {
      stream.removeAllListeners()
      if (stream.destroy) stream.destroy()
      return Promise.resolve({ done: true })
    },
    [Symbol.asyncIterator]() {
      return this
    },
  }
}

/**
 * Collect an async iterable into a single Buffer.
 *
 * @param {AsyncIterable<Uint8Array>|Uint8Array[]} iterable
 * @returns {Promise<Buffer>}
 */
async function collectBuffer(iterable) {
  const buffers = []
  if (Array.isArray(iterable)) {
    for (const chunk of iterable) buffers.push(Buffer.from(chunk))
  } else {
    for await (const chunk of iterable) buffers.push(Buffer.from(chunk))
  }
  return Buffer.concat(buffers)
}

/**
 * Resolve SSH authentication parameters from the onAuth callback.
 *
 * Supported auth shapes returned by onAuth:
 *   { username, password }              → password auth
 *   { username, privateKey, passphrase? } → key-based auth
 *   { username, agent }                 → SSH agent forwarding
 *   { cancel: true }                    → abort
 *
 * Falls back to ssh-agent via SSH_AUTH_SOCK env var if no callback and no password.
 *
 * @param {object} parsed - Parsed SSH URL components
 * @param {Function} [onAuth] - Auth callback
 * @returns {Promise<object>} ssh2 connection config
 */
async function resolveSSHAuth(parsed, onAuth) {
  const config = {
    host: parsed.host,
    port: parsed.port,
    username: parsed.username,
  }

  if (onAuth) {
    const auth = await onAuth(
      `ssh://${parsed.host}${parsed.port !== 22 ? ':' + parsed.port : ''}${parsed.path}`,
      { username: parsed.username }
    )
    if (auth && auth.cancel) throw new UserCanceledError()
    if (auth) {
      if (auth.username) config.username = auth.username
      if (auth.privateKey) {
        config.privateKey = auth.privateKey
        if (auth.passphrase) config.passphrase = auth.passphrase
      } else if (auth.password) {
        config.password = auth.password
      } else if (auth.agent) {
        config.agent = auth.agent
      }
    }
  }

  // If no explicit auth method, try SSH agent
  if (!config.password && !config.privateKey && !config.agent) {
    if (typeof process !== 'undefined' && process.env && process.env.SSH_AUTH_SOCK) {
      config.agent = process.env.SSH_AUTH_SOCK
    }
  }

  return config
}

/**
 * Establish an SSH connection and execute a git command.
 *
 * @param {object} params
 * @param {string} params.url - SSH URL
 * @param {string} params.service - git service name (e.g., 'git-upload-pack')
 * @param {Function} [params.onAuth] - Auth callback
 * @param {Function} [params.onAuthFailure] - Auth failure callback
 * @param {Function} [params.onAuthSuccess] - Auth success callback
 * @param {Buffer} [params.inputData] - Data to write to stdin
 * @returns {Promise<{ body: AsyncIterableIterator<Buffer>, channel: object, connection: object }>}
 */
async function sshExec({
  url,
  service,
  onAuth,
  onAuthFailure,
  onAuthSuccess,
  inputData,
}) {
  let Client
  try {
    const ssh2 = await import('ssh2')
    // ssh2 is CJS — dynamic import wraps it in a default export
    const mod = ssh2.default || ssh2
    Client = mod.Client
    if (!Client) throw new Error('ssh2 Client not found')
  } catch (e) {
    throw new Error(
      'SSH transport requires the "ssh2" package. Install it with: npm install ssh2'
    )
  }

  const parsed = parseSSHUrl(url)
  let config = await resolveSSHAuth(parsed, onAuth)
  let authSucceeded = false

  return new Promise((resolve, reject) => {
    const conn = new Client()

    conn.on('ready', () => {
      authSucceeded = true
      if (onAuthSuccess) {
        onAuthSuccess(url, { username: config.username })
      }

      const cmd = `${service} '${parsed.path}'`
      conn.exec(cmd, (err, channel) => {
        if (err) {
          conn.end()
          return reject(err)
        }

        // Collect stderr for error reporting
        let stderrChunks = []
        channel.stderr.on('data', chunk => {
          stderrChunks.push(Buffer.from(chunk))
        })

        // Write input data if provided
        if (inputData && inputData.length > 0) {
          channel.write(inputData)
          channel.end()
        }

        const body = fromStream(channel)

        // Handle channel close - report errors from stderr
        channel.on('close', (code) => {
          if (code && code !== 0 && stderrChunks.length > 0) {
            const stderr = Buffer.concat(stderrChunks).toString('utf8')
            // Don't reject since data may already have been consumed
            // The error will manifest as a parse error if the response is incomplete
            console.error(`SSH command exited with code ${code}: ${stderr}`)
          }
          conn.end()
        })

        resolve({ body, channel, connection: conn })
      })
    })

    conn.on('error', async err => {
      if (!authSucceeded && onAuthFailure) {
        try {
          const newAuth = await onAuthFailure(url, { username: config.username })
          if (newAuth && !newAuth.cancel) {
            // Retry with new credentials
            config = {
              ...config,
              ...newAuth,
            }
            const retryConn = new Client()
            retryConn.on('ready', () => {
              if (onAuthSuccess) {
                onAuthSuccess(url, { username: config.username })
              }
              const cmd = `${service} '${parsed.path}'`
              retryConn.exec(cmd, (execErr, channel) => {
                if (execErr) {
                  retryConn.end()
                  return reject(execErr)
                }
                if (inputData && inputData.length > 0) {
                  channel.write(inputData)
                  channel.end()
                }
                const body = fromStream(channel)
                channel.on('close', () => retryConn.end())
                resolve({ body, channel, connection: retryConn })
              })
            })
            retryConn.on('error', retryErr => {
              reject(retryErr)
            })
            retryConn.connect(config)
            return
          }
        } catch (e) {
          // Auth failure callback itself failed
        }
      }
      reject(err)
    })

    conn.connect(config)
  })
}

/**
 * GitRemoteSSH - SSH transport for dimorphic-git.
 *
 * Implements the same interface as GitRemoteHTTP:
 *   - capabilities()
 *   - discover({ service, url, ... })
 *   - connect({ service, url, body, ... })
 *
 * Uses the ssh2 package to execute git-upload-pack and git-receive-pack
 * over SSH, then speaks the same pack wire protocol as HTTP.
 */
export class GitRemoteSSH {
  /**
   * Returns the capabilities of the GitRemoteSSH class.
   *
   * @returns {Promise<string[]>}
   */
  static async capabilities() {
    return ['discover', 'connect']
  }

  /**
   * Discover refs from a remote repository over SSH.
   *
   * SSH ref discovery works differently from HTTP: we run the git service
   * command (e.g. git-upload-pack) and the server immediately sends the
   * ref advertisement on stdout. There is no separate "info/refs" step.
   *
   * @param {Object} args
   * @param {Function} [args.onAuth] - Auth callback
   * @param {Function} [args.onAuthSuccess] - Auth success callback
   * @param {Function} [args.onAuthFailure] - Auth failure callback
   * @param {string} args.service - Git service (e.g. 'git-upload-pack')
   * @param {string} args.url - SSH URL
   * @returns {Promise<Object>} - Parsed ref advertisement
   */
  static async discover({
    onAuth,
    onAuthSuccess,
    onAuthFailure,
    service,
    url,
    // These params are accepted for API compatibility but not used for SSH
    http,
    onProgress,
    corsProxy,
    headers,
    protocolVersion,
  }) {
    const { body, channel, connection } = await sshExec({
      url,
      service,
      onAuth,
      onAuthFailure,
      onAuthSuccess,
    })

    try {
      // SSH ref advertisement has no "# service=" preamble (that's HTTP-only).
      // The server sends refs directly in pkt-line format.
      // We parse it using the same parser but need to handle the format difference.
      const result = await parseSSHRefsAd(body, { service })

      // Close the connection — connect() will open a new one
      try {
        if (channel.end) channel.end()
        if (channel.close) channel.close()
      } catch (_) {
        // ignore close errors
      }
      connection.end()

      result.auth = { username: parseSSHUrl(url).username }
      return result
    } catch (err) {
      try { connection.end() } catch (_) {}
      throw err
    }
  }

  /**
   * Connect to a remote repository over SSH and exchange pack data.
   *
   * @param {Object} args
   * @param {string} args.service - Git service (e.g. 'git-upload-pack')
   * @param {string} args.url - SSH URL
   * @param {any} args.auth - Auth info (from discover)
   * @param {any} args.body - Request body (pack data)
   * @param {Function} [args.onAuth] - Auth callback
   * @returns {Promise<{ body: AsyncIterableIterator<Buffer> }>}
   */
  static async connect({
    service,
    url,
    auth,
    body,
    onAuth,
    // Accepted for compatibility but unused
    http,
    onProgress,
    corsProxy,
    headers,
  }) {
    // Collect the body into a single buffer
    const inputData = await collectBuffer(body)

    const { body: responseBody } = await sshExec({
      url,
      service,
      onAuth,
      inputData,
    })

    return {
      url,
      method: 'POST',
      statusCode: 200,
      statusMessage: 'OK',
      body: responseBody,
      headers: {},
    }
  }
}

/**
 * Parse SSH ref advertisement response.
 *
 * SSH ref advertisement is similar to HTTP but without the "# service=..." preamble.
 * The server sends pkt-lines directly starting with the first ref + capabilities.
 *
 * @param {AsyncIterableIterator<Buffer>} body
 * @param {object} options
 * @param {string} options.service
 * @returns {Promise<{ capabilities: Set<string>, refs: Map<string, string>, symrefs: Map<string, string> }>}
 */
async function parseSSHRefsAd(body, { service }) {
  const { GitPktLine } = await import('../models/GitPktLine.js')
  const { EmptyServerResponseError } = await import(
    '../errors/EmptyServerResponseError.js'
  )

  const capabilities = new Set()
  const refs = new Map()
  const symrefs = new Map()

  const read = GitPktLine.streamReader(body)

  let lineOne = await read()
  // Skip flushes
  while (lineOne === null) lineOne = await read()
  if (lineOne === true) throw new EmptyServerResponseError()

  // Check for protocol v2
  const lineOneStr = lineOne.toString('utf8')
  if (lineOneStr.includes('version 2')) {
    const { parseCapabilitiesV2 } = await import(
      '../wire/parseCapabilitiesV2.js'
    )
    return parseCapabilitiesV2(read)
  }

  // SSH doesn't have the "# service=..." line, so lineOne IS the first ref line.
  // However, some SSH servers (like GitHub) DO include the service line.
  // Check if this looks like a service advertisement line.
  const trimmedLine = lineOneStr.replace(/\n$/, '')
  if (trimmedLine === `# service=${service}`) {
    // This is an HTTP-style response (some SSH implementations include it)
    // Read next meaningful line
    let lineTwo = await read()
    while (lineTwo === null) lineTwo = await read()
    if (lineTwo === true) return { capabilities, refs, symrefs }
    lineOne = lineTwo
  }

  // Parse first ref + capabilities (separated by NUL byte)
  const firstLine = (Buffer.isBuffer(lineOne) ? lineOne : Buffer.from(lineOne))
    .toString('utf8')
    .replace(/\n$/, '')

  const [firstRef, capabilitiesLine] = firstLine.split('\x00')
  if (capabilitiesLine) {
    capabilitiesLine.split(' ').map(x => capabilities.add(x))
  }

  // Handle empty repo (no-refs)
  if (firstRef !== '0000000000000000000000000000000000000000 capabilities^{}') {
    const parts = firstRef.split(' ')
    if (parts.length === 2) {
      refs.set(parts[1], parts[0])
    }
  }

  // Read remaining refs — stop at flush packet (null) or end (true)
  // In SSH, the server sends refs then a flush, then waits for client wants.
  // We must NOT try to read past the flush or we'll block forever.
  while (true) {
    const line = await read()
    if (line === true || line === null) break
    const lineStr = (Buffer.isBuffer(line) ? line : Buffer.from(line))
      .toString('utf8')
      .replace(/\n$/, '')
    const parts = lineStr.split(' ')
    if (parts.length === 2) {
      refs.set(parts[1], parts[0])
    }
  }

  // Extract symrefs from capabilities
  for (const cap of capabilities) {
    if (cap.startsWith('symref=')) {
      const m = cap.match(/symref=([^:]+):(.*)/)
      if (m && m.length === 3) {
        symrefs.set(m[1], m[2])
      }
    }
  }

  return { protocolVersion: 1, capabilities, refs, symrefs }
}
