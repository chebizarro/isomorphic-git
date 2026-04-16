import * as git from 'dimorphic-git'
import * as fs from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const { promises: fsp } = fs

describe('P2/P3 features', () => {
  let dir

  beforeEach(async () => {
    dir = join(tmpdir(), `test-p2p3-${Date.now()}-${Math.random().toString(36).slice(2)}`)
    await fsp.mkdir(dir, { recursive: true })
    await git.init({ fs, dir })
  })

  afterEach(async () => {
    await fsp.rm(dir, { recursive: true, force: true }).catch(() => {})
  })

  async function makeCommit(msg, files = {}) {
    for (const [name, content] of Object.entries(files)) {
      await fsp.writeFile(join(dir, name), content)
      await git.add({ fs, dir, filepath: name })
    }
    if (Object.keys(files).length === 0) {
      await fsp.writeFile(join(dir, `${msg}.txt`), msg)
      await git.add({ fs, dir, filepath: `${msg}.txt` })
    }
    return git.commit({ fs, dir, message: msg, author: { name: 'T', email: 't@t' } })
  }

  // ---- Diff extended ----
  describe('diffTreeToIndex', () => {
    it('shows staged changes vs HEAD', async () => {
      await makeCommit('init', { 'a.txt': 'hello' })
      await fsp.writeFile(join(dir, 'b.txt'), 'new file')
      await git.add({ fs, dir, filepath: 'b.txt' })

      const changes = await git.diffTreeToIndex({ fs, dir })
      expect(changes.length).toBe(1)
      expect(changes[0].status).toBe('added')
      expect(changes[0].path).toBe('b.txt')
    })

    it('shows deleted files', async () => {
      await makeCommit('init', { 'a.txt': 'hello', 'b.txt': 'world' })
      await git.remove({ fs, dir, filepath: 'b.txt' })

      const changes = await git.diffTreeToIndex({ fs, dir })
      expect(changes.find(c => c.path === 'b.txt').status).toBe('deleted')
    })
  })

  describe('diffBlobs', () => {
    it('diffs two blob objects', async () => {
      const oid1 = await git.writeBlob({ fs, dir, blob: Buffer.from('hello\n') })
      const oid2 = await git.writeBlob({ fs, dir, blob: Buffer.from('hello\nworld\n') })

      const result = await git.diffBlobs({ fs, dir, oldOid: oid1, newOid: oid2 })
      expect(result.hunks.length).toBeGreaterThan(0)
      expect(result.oldContent).toBe('hello\n')
      expect(result.newContent).toBe('hello\nworld\n')
    })
  })

  describe('diffPatchId', () => {
    it('produces a consistent hash for same changes', async () => {
      const oid1 = await makeCommit('first', { 'a.txt': 'hello' })
      const oid2 = await makeCommit('second', { 'a.txt': 'hello world' })

      const id1 = await git.diffPatchId({ fs, dir, oldRef: oid1, newRef: oid2 })
      const id2 = await git.diffPatchId({ fs, dir, oldRef: oid1, newRef: oid2 })
      expect(id1).toBe(id2)
      expect(id1).toMatch(/^[0-9a-f]{40}$/)
    })
  })

  // ---- Remote extended ----
  describe('setRemoteUrl', () => {
    it('changes the URL of a remote', async () => {
      await git.addRemote({ fs, dir, remote: 'origin', url: 'https://old.example.com' })
      await git.setRemoteUrl({ fs, dir, remote: 'origin', url: 'https://new.example.com' })

      const url = await git.getConfig({ fs, dir, path: 'remote.origin.url' })
      expect(url).toBe('https://new.example.com')
    })
  })

  describe('renameRemote', () => {
    it('renames a remote', async () => {
      await git.addRemote({ fs, dir, remote: 'origin', url: 'https://example.com' })
      await git.renameRemote({ fs, dir, oldName: 'origin', newName: 'upstream' })

      const remotes = await git.listRemotes({ fs, dir })
      expect(remotes.find(r => r.remote === 'upstream')).toBeTruthy()
      expect(remotes.find(r => r.remote === 'origin')).toBeFalsy()
    })
  })

  // ---- Shallow ----
  describe('listShallowRoots', () => {
    it('returns empty for non-shallow repo', async () => {
      expect(await git.listShallowRoots({ fs, dir })).toEqual([])
    })

    it('lists shallow OIDs', async () => {
      const oid = await makeCommit('test')
      await fsp.writeFile(join(dir, '.git', 'shallow'), oid + '\n')
      const roots = await git.listShallowRoots({ fs, dir })
      expect(roots).toEqual([oid])
    })
  })

  // ---- Sparse checkout ----
  describe('sparse checkout', () => {
    it('init creates sparse-checkout file and config', async () => {
      await git.sparseCheckoutInit({ fs, dir, patterns: ['/src/', '/docs/'] })

      const patterns = await git.sparseCheckoutList({ fs, dir })
      expect(patterns).toEqual(['/src/', '/docs/'])

      const config = await git.getConfig({ fs, dir, path: 'core.sparseCheckout' })
      expect(config).toBeTruthy()
    })

    it('add appends patterns', async () => {
      await git.sparseCheckoutInit({ fs, dir })
      await git.sparseCheckoutAdd({ fs, dir, patterns: ['/extra/'] })

      const patterns = await git.sparseCheckoutList({ fs, dir })
      expect(patterns).toContain('/extra/')
    })

    it('set replaces patterns', async () => {
      await git.sparseCheckoutInit({ fs, dir, patterns: ['/old/'] })
      await git.sparseCheckoutSet({ fs, dir, patterns: ['/new/'] })

      const patterns = await git.sparseCheckoutList({ fs, dir })
      expect(patterns).toEqual(['/new/'])
    })
  })

  // ---- Refs extended ----
  describe('foreachRef', () => {
    it('lists refs matching pattern', async () => {
      await makeCommit('test')
      await git.branch({ fs, dir, ref: 'feature' })

      const refs = await git.foreachRef({ fs, dir, pattern: 'refs/heads/**' })
      expect(refs.length).toBeGreaterThanOrEqual(2)
      expect(refs.some(r => r.ref.includes('feature'))).toBe(true)
    })
  })

  describe('refNameIsValid', () => {
    it('validates ref names', () => {
      expect(git.refNameIsValid('refs/heads/main')).toBe(true)
      expect(git.refNameIsValid('refs/heads/.bad')).toBe(false)
      expect(git.refNameIsValid('refs/heads/has space')).toBe(false)
    })
  })

  describe('symbolicRefTarget', () => {
    it('reads HEAD symbolic target', async () => {
      await makeCommit('test')
      const target = await git.symbolicRefTarget({ fs, dir, ref: 'HEAD' })
      expect(target).toMatch(/^refs\/heads\//)
    })
  })

  // ---- Tree extended ----
  describe('buildTree', () => {
    it('creates a tree object from entries', async () => {
      const blobOid = await git.writeBlob({ fs, dir, blob: Buffer.from('content') })
      const treeOid = await git.buildTree({
        fs, dir,
        entries: [
          { mode: '100644', path: 'file.txt', oid: blobOid },
        ],
      })
      expect(treeOid).toMatch(/^[0-9a-f]{40}$/)

      const entries = await git.walkTree({ fs, dir, oid: treeOid })
      expect(entries.length).toBe(1)
      expect(entries[0].path).toBe('file.txt')
    })
  })

  describe('walkTree', () => {
    it('walks tree entries', async () => {
      await makeCommit('test', { 'a.txt': 'hello', 'b.txt': 'world' })
      const head = await git.resolveRef({ fs, dir, ref: 'HEAD' })
      const commit = await git.readCommit({ fs, dir, oid: head })

      const entries = await git.walkTree({ fs, dir, oid: commit.commit.tree })
      expect(entries.length).toBeGreaterThanOrEqual(2)
      expect(entries.some(e => e.path === 'a.txt')).toBe(true)
    })
  })

  describe('treeEntryByPath', () => {
    it('finds entry in tree by path', async () => {
      await makeCommit('test', { 'hello.txt': 'hello world' })
      const head = await git.resolveRef({ fs, dir, ref: 'HEAD' })
      const commit = await git.readCommit({ fs, dir, oid: head })

      const entry = await git.treeEntryByPath({
        fs, dir, oid: commit.commit.tree, filepath: 'hello.txt',
      })
      expect(entry).not.toBeNull()
      expect(entry.path).toBe('hello.txt')
      expect(entry.type).toBe('blob')
    })
  })

  // ---- Signature ----
  describe('signatureFromBuffer', () => {
    it('parses a git signature string', () => {
      const sig = git.signatureFromBuffer('Test User <test@example.com> 1234567890 +0530')
      expect(sig.name).toBe('Test User')
      expect(sig.email).toBe('test@example.com')
      expect(sig.timestamp).toBe(1234567890)
      expect(sig.timezoneOffset).toBe(330) // 5h30m
    })

    it('handles negative timezone', () => {
      const sig = git.signatureFromBuffer('User <u@e.com> 1000000000 -0800')
      expect(sig.timezoneOffset).toBe(-480)
    })

    it('returns null for invalid input', () => {
      expect(git.signatureFromBuffer('invalid')).toBeNull()
      expect(git.signatureFromBuffer(null)).toBeNull()
    })
  })

  describe('signatureCreate', () => {
    it('creates a formatted signature string', () => {
      const sig = git.signatureCreate({
        name: 'Test', email: 'test@example.com',
        timestamp: 1234567890, timezoneOffset: 330,
      })
      expect(sig).toBe('Test <test@example.com> 1234567890 +0530')
    })

    it('handles negative timezone', () => {
      const sig = git.signatureCreate({
        name: 'Test', email: 'test@example.com',
        timestamp: 1000000000, timezoneOffset: -480,
      })
      expect(sig).toBe('Test <test@example.com> 1000000000 -0800')
    })
  })

  describe('signatureDefault', () => {
    it('returns null when user config not set', async () => {
      expect(await git.signatureDefault({ fs, dir })).toBeNull()
    })

    it('returns config values when set', async () => {
      await git.setConfig({ fs, dir, path: 'user.name', value: 'Test User' })
      await git.setConfig({ fs, dir, path: 'user.email', value: 'test@test.com' })

      const sig = await git.signatureDefault({ fs, dir })
      expect(sig).toEqual({ name: 'Test User', email: 'test@test.com' })
    })
  })

  // ---- Ignore extended ----
  describe('ignorePathIsIgnored', () => {
    it('checks against .gitignore', async () => {
      await fsp.writeFile(join(dir, '.gitignore'), 'node_modules/\n*.log\n')

      expect(await git.ignorePathIsIgnored({ fs, dir, filepath: 'node_modules/foo' })).toBe(true)
      expect(await git.ignorePathIsIgnored({ fs, dir, filepath: 'app.log' })).toBe(true)
      expect(await git.ignorePathIsIgnored({ fs, dir, filepath: 'src/app.js' })).toBe(false)
    })
  })

  describe('ignoreAddRule / ignoreClearRules', () => {
    it('adds runtime rules and clears them', async () => {
      await git.ignoreAddRule({ fs, dir, rules: ['*.tmp'] })
      expect(await git.ignorePathIsIgnored({ fs, dir, filepath: 'cache.tmp' })).toBe(true)

      await git.ignoreClearRules({ fs, dir })
      expect(await git.ignorePathIsIgnored({ fs, dir, filepath: 'cache.tmp' })).toBe(false)
    })
  })
})
