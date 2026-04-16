/* eslint-env jest */
import * as git from 'dimorphic-git'
import * as fs from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

function makeTmpDir() {
  return fs.mkdtempSync(join(tmpdir(), 'dimogit-phase4-'))
}

async function initRepo() {
  const dir = makeTmpDir()
  await git.init({ fs, dir })
  const gitdir = join(dir, '.git')
  return { dir, gitdir }
}

async function initRepoWithCommit() {
  const { dir, gitdir } = await initRepo()
  fs.writeFileSync(join(dir, 'test.txt'), 'hello world\n')
  await git.add({ fs, dir, filepath: 'test.txt' })
  const oid = await git.commit({
    fs, dir,
    message: 'Initial commit',
    author: { name: 'Test', email: 'test@test.com', timestamp: 1000000000, timezoneOffset: 0 },
  })
  return { dir, gitdir, oid }
}

// ===== Reflog Extended =====
describe('reflogExt', () => {
  it('deleteReflog removes the reflog file', async () => {
    const { dir, gitdir } = await initRepoWithCommit()
    const branch = await git.currentBranch({ fs, dir })
    const logPath = join(gitdir, 'logs', 'refs', 'heads', branch)
    fs.mkdirSync(join(logPath, '..'), { recursive: true })
    fs.writeFileSync(logPath, '0000 1111 Test <t@t.com> 1000 +0000\tcommit: init\n')
    expect(fs.existsSync(logPath)).toBe(true)

    await git.deleteReflog({ fs, dir, ref: `refs/heads/${branch}` })
    expect(fs.existsSync(logPath)).toBe(false)
  })

  it('dropReflogEntry removes a specific entry', async () => {
    const { dir, gitdir } = await initRepoWithCommit()
    const branch = await git.currentBranch({ fs, dir })
    const logPath = join(gitdir, 'logs', 'refs', 'heads', branch)
    fs.mkdirSync(join(logPath, '..'), { recursive: true })
    fs.writeFileSync(logPath, 'line1\nline2\nline3\n')

    await git.dropReflogEntry({ fs, dir, ref: `refs/heads/${branch}`, index: 0 })
    const content = fs.readFileSync(logPath, 'utf8')
    expect(content.trim().split('\n')).toHaveLength(2)
    expect(content).toContain('line1')
    expect(content).toContain('line2')
    expect(content).not.toContain('line3')
  })

  it('renameReflog moves reflog file', async () => {
    const { dir, gitdir } = await initRepoWithCommit()
    const oldRef = 'refs/heads/old-branch'
    const newRef = 'refs/heads/new-branch'
    const oldPath = join(gitdir, 'logs', oldRef)
    fs.mkdirSync(join(oldPath, '..'), { recursive: true })
    fs.writeFileSync(oldPath, 'some reflog content\n')

    await git.renameReflog({ fs, dir, oldRef, newRef })
    expect(fs.existsSync(oldPath)).toBe(false)
    const newPath = join(gitdir, 'logs', newRef)
    expect(fs.existsSync(newPath)).toBe(true)
    expect(fs.readFileSync(newPath, 'utf8')).toContain('some reflog content')
  })
})

// ===== Transaction =====
describe('refTransaction', () => {
  it('applies multiple ref updates atomically', async () => {
    const { dir, oid } = await initRepoWithCommit()

    await git.refTransaction({
      fs, dir,
      updates: [
        { ref: 'refs/heads/branch-a', oid },
        { ref: 'refs/heads/branch-b', oid },
      ],
    })

    const a = await git.resolveRef({ fs, dir, ref: 'refs/heads/branch-a' })
    const b = await git.resolveRef({ fs, dir, ref: 'refs/heads/branch-b' })
    expect(a).toBe(oid)
    expect(b).toBe(oid)
  })

  it('can delete refs in a transaction', async () => {
    const { dir, oid } = await initRepoWithCommit()
    await git.writeRef({ fs, dir, ref: 'refs/heads/to-delete', value: oid })

    await git.refTransaction({
      fs, dir,
      updates: [{ ref: 'refs/heads/to-delete', delete: true }],
    })

    await expect(git.resolveRef({ fs, dir, ref: 'refs/heads/to-delete' })).rejects.toThrow()
  })

  it('can create symbolic refs', async () => {
    const { dir, gitdir, oid } = await initRepoWithCommit()
    const branch = await git.currentBranch({ fs, dir })

    await git.refTransaction({
      fs, dir,
      updates: [{ ref: 'refs/heads/sym-link', symbolic: `refs/heads/${branch}` }],
    })

    const content = fs.readFileSync(join(gitdir, 'refs', 'heads', 'sym-link'), 'utf8')
    expect(content.trim()).toBe(`ref: refs/heads/${branch}`)
  })
})

// ===== Pathspec =====
describe('pathspec', () => {
  it('pathspecNew creates a Pathspec', () => {
    const ps = git.pathspecNew(['*.js', '!vendor/**'])
    expect(ps).toBeInstanceOf(git.Pathspec)
    expect(ps.patterns).toEqual(['*.js', '!vendor/**'])
  })

  it('matches simple patterns', () => {
    expect(git.pathspecMatchesPath(['*.js'], 'foo.js')).toBe(true)
    expect(git.pathspecMatchesPath(['*.js'], 'foo.txt')).toBe(false)
  })

  it('supports negation', () => {
    const ps = git.pathspecNew(['*.js', '!test.js'])
    expect(ps.matches('app.js')).toBe(true)
    expect(ps.matches('test.js')).toBe(false)
  })

  it('supports prefix matching', () => {
    expect(git.pathspecMatchesPath(['src'], 'src/file.js')).toBe(true)
    expect(git.pathspecMatchesPath(['src'], 'lib/file.js')).toBe(false)
  })

  it('filter returns matching paths', () => {
    const ps = git.pathspecNew(['*.js'])
    expect(ps.filter(['a.js', 'b.txt', 'c.js'])).toEqual(['a.js', 'c.js'])
  })
})

// ===== Blob Extended =====
describe('blobExt', () => {
  it('blobIsBinary detects text blobs', async () => {
    const { dir } = await initRepoWithCommit()
    const blobOid = await git.writeBlob({ fs, dir, blob: Buffer.from('hello') })
    expect(await git.blobIsBinary({ fs, dir, oid: blobOid })).toBe(false)
  })

  it('blobIsBinary detects binary blobs', async () => {
    const { dir } = await initRepoWithCommit()
    const blobOid = await git.writeBlob({ fs, dir, blob: Buffer.from([0x00, 0x01, 0x02]) })
    expect(await git.blobIsBinary({ fs, dir, oid: blobOid })).toBe(true)
  })

  it('blobSize returns correct size', async () => {
    const { dir } = await initRepoWithCommit()
    const blobOid = await git.writeBlob({ fs, dir, blob: Buffer.from('twelve chars') })
    expect(await git.blobSize({ fs, dir, oid: blobOid })).toBe(12)
  })

  it('blobCreateFromWorkdir creates a blob from a file', async () => {
    const { dir } = await initRepoWithCommit()
    fs.writeFileSync(join(dir, 'new.txt'), 'new content')
    const oid = await git.blobCreateFromWorkdir({ fs, dir, filepath: 'new.txt' })
    expect(oid).toMatch(/^[0-9a-f]{40}$/)
    const size = await git.blobSize({ fs, dir, oid })
    expect(size).toBe(11)
  })
})

// ===== Email =====
describe('emailCreateFromCommit', () => {
  it('generates mbox formatted output', async () => {
    const { dir, oid } = await initRepoWithCommit()
    const mbox = await git.emailCreateFromCommit({ fs, dir, oid })
    expect(mbox).toContain(`From ${oid}`)
    expect(mbox).toContain('From: Test <test@test.com>')
    expect(mbox).toContain('Subject: [PATCH 1/1] Initial commit')
    expect(mbox).toContain('dimorphic-git')
  })

  it('supports patch numbering', async () => {
    const { dir, oid } = await initRepoWithCommit()
    const mbox = await git.emailCreateFromCommit({ fs, dir, oid, patchNumber: 3, totalPatches: 5 })
    expect(mbox).toContain('Subject: [PATCH 3/5] Initial commit')
  })
})

// ===== Refspec =====
describe('refspecExt', () => {
  it('refspecParse parses a simple refspec', () => {
    const result = git.refspecParse('+refs/heads/*:refs/remotes/origin/*')
    expect(result.force).toBe(true)
    expect(result.src).toBe('refs/heads/*')
    expect(result.dst).toBe('refs/remotes/origin/*')
  })

  it('refspecParse handles non-force refspec', () => {
    const result = git.refspecParse('refs/heads/main:refs/remotes/origin/main')
    expect(result.force).toBe(false)
    expect(result.src).toBe('refs/heads/main')
  })

  it('refspecTransform transforms through wildcard', () => {
    const result = git.refspecTransform('+refs/heads/*:refs/remotes/origin/*', 'refs/heads/main')
    expect(result).toBe('refs/remotes/origin/main')
  })

  it('refspecTransform returns null for non-matching', () => {
    expect(git.refspecTransform('+refs/heads/*:refs/remotes/origin/*', 'refs/tags/v1')).toBeNull()
  })

  it('refspecSrcMatches checks matching', () => {
    expect(git.refspecSrcMatches('+refs/heads/*:refs/remotes/origin/*', 'refs/heads/dev')).toBe(true)
    expect(git.refspecSrcMatches('+refs/heads/*:refs/remotes/origin/*', 'refs/tags/v1')).toBe(false)
  })
})

// ===== Graph Extended =====
describe('graphExt', () => {
  it('graphAheadBehind computes counts', async () => {
    const { dir, oid: first } = await initRepoWithCommit()
    const branch = await git.currentBranch({ fs, dir })

    fs.writeFileSync(join(dir, 'a.txt'), 'a')
    await git.add({ fs, dir, filepath: 'a.txt' })
    await git.commit({
      fs, dir,
      message: 'Second',
      author: { name: 'Test', email: 'test@test.com', timestamp: 1000000100, timezoneOffset: 0 },
    })

    await git.writeRef({ fs, dir, ref: 'refs/heads/old', value: first })

    const result = await git.graphAheadBehind({
      fs, dir, local: `refs/heads/${branch}`, upstream: 'refs/heads/old',
    })
    expect(result.ahead).toBe(1)
    expect(result.behind).toBe(0)
  })

  it('graphDescendantOf checks ancestry', async () => {
    const { dir, oid: first } = await initRepoWithCommit()

    fs.writeFileSync(join(dir, 'b.txt'), 'b')
    await git.add({ fs, dir, filepath: 'b.txt' })
    const second = await git.commit({
      fs, dir,
      message: 'Second',
      author: { name: 'Test', email: 'test@test.com', timestamp: 1000000100, timezoneOffset: 0 },
    })

    expect(await git.graphDescendantOf({ fs, dir, oid: second, ancestor: first })).toBe(true)
    expect(await git.graphDescendantOf({ fs, dir, oid: first, ancestor: second })).toBe(false)
    expect(await git.graphDescendantOf({ fs, dir, oid: first, ancestor: first })).toBe(false)
  })
})

// ===== Tag Extended =====
describe('tagExt', () => {
  it('tagForeach iterates over tags', async () => {
    const { dir, oid } = await initRepoWithCommit()
    await git.tag({ fs, dir, ref: 'v1.0', object: oid })
    await git.tag({ fs, dir, ref: 'v2.0', object: oid })

    const tags = []
    await git.tagForeach({ fs, dir, callback: (name, tagOid) => tags.push(name) })
    expect(tags.sort()).toEqual(['v1.0', 'v2.0'])
  })

  it('tagPeel peels a lightweight tag to commit', async () => {
    const { dir, oid } = await initRepoWithCommit()
    const result = await git.tagPeel({ fs, dir, oid })
    expect(result.type).toBe('commit')
    expect(result.oid).toBe(oid)
  })

  it('tagTarget reads annotated tag details', async () => {
    const { dir, oid } = await initRepoWithCommit()
    await git.annotatedTag({
      fs, dir, ref: 'v3.0', object: oid, message: 'Release 3',
      tagger: { name: 'Test', email: 'test@test.com', timestamp: 1000000000, timezoneOffset: 0 },
    })
    const tagOid = await git.resolveRef({ fs, dir, ref: 'refs/tags/v3.0' })
    const info = await git.tagTarget({ fs, dir, oid: tagOid })
    expect(info.targetOid).toBe(oid)
    expect(info.targetType).toBe('commit')
    expect(info.tagName).toBe('v3.0')
    expect(info.message).toContain('Release 3')
  })

  it('tagCreateFromBuffer creates a tag from raw buffer', async () => {
    const { dir, oid } = await initRepoWithCommit()
    const tagContent = `object ${oid}\ntype commit\ntag v4.0\ntagger Test <test@test.com> 1000000000 +0000\n\nTag from buffer\n`
    const tagOid = await git.tagCreateFromBuffer({ fs, dir, buffer: tagContent })
    expect(tagOid).toMatch(/^[0-9a-f]{40}$/)
    const resolved = await git.resolveRef({ fs, dir, ref: 'refs/tags/v4.0' })
    expect(resolved).toBe(tagOid)
  })
})

// ===== Notes Extended =====
describe('notesExt', () => {
  const author = { name: 'Test', email: 'test@test.com', timestamp: 1000000000, timezoneOffset: 0 }

  it('noteCreate and noteRead work together', async () => {
    const { dir, oid } = await initRepoWithCommit()

    await git.noteCreate({ fs, dir, oid, note: 'This is a note', author, committer: author })
    const result = await git.noteRead({ fs, dir, oid })
    expect(result).not.toBeNull()
    expect(result.note).toBe('This is a note')
  })

  it('noteRead returns null for missing note', async () => {
    const { dir } = await initRepoWithCommit()
    const result = await git.noteRead({ fs, dir, oid: '0000000000000000000000000000000000000000' })
    expect(result).toBeNull()
  })

  it('noteForeach iterates over notes', async () => {
    const { dir, oid } = await initRepoWithCommit()
    await git.noteCreate({ fs, dir, oid, note: 'A note', author, committer: author })

    const notes = []
    await git.noteForeach({
      fs, dir,
      callback: ({ annotatedOid, noteOid }) => notes.push(annotatedOid),
    })
    expect(notes).toContain(oid)
  })

  it('noteRemove removes a note', async () => {
    const { dir, oid } = await initRepoWithCommit()
    await git.noteCreate({ fs, dir, oid, note: 'To be removed', author, committer: author })
    await git.noteRemove({ fs, dir, oid, author, committer: author })
    const result = await git.noteRead({ fs, dir, oid })
    expect(result).toBeNull()
  })
})

// ===== PackBuilder =====
describe('packBuilder', () => {
  it('packBuilderNew creates a builder', async () => {
    const { dir } = await initRepoWithCommit()
    const builder = await git.packBuilderNew({ fs, dir })
    expect(builder).toBeInstanceOf(git.PackBuilder)
    expect(builder.count).toBe(0)
  })

  it('insert and insertCommit add objects', async () => {
    const { dir, oid } = await initRepoWithCommit()
    const builder = await git.packBuilderNew({ fs, dir })
    await builder.insertCommit(oid)
    expect(builder.count).toBeGreaterThan(1)
    expect(builder.oids).toContain(oid)
  })

  it('write produces a packfile', async () => {
    const { dir, oid } = await initRepoWithCommit()
    const builder = await git.packBuilderNew({ fs, dir })
    await builder.insertCommit(oid)
    const result = await builder.write()
    expect(result.filename).toBeTruthy()
    expect(result.packfile).toBeInstanceOf(Uint8Array)
    expect(result.packfile.length).toBeGreaterThan(0)
  })
})

// ===== Mailmap =====
describe('mailmap', () => {
  it('Mailmap resolves name/email', () => {
    const mm = new git.Mailmap()
    mm.addEntry({ realName: 'John Doe', realEmail: 'john@example.com', replaceEmail: 'old@example.com' })
    const resolved = mm.resolve('Old Name', 'old@example.com')
    expect(resolved.name).toBe('John Doe')
    expect(resolved.email).toBe('john@example.com')
  })

  it('Mailmap addBuffer parses mailmap format', () => {
    const mm = new git.Mailmap()
    mm.addBuffer('Proper Name <proper@email.com> <old@email.com>\n# comment\n')
    const resolved = mm.resolve('Whatever', 'old@email.com')
    expect(resolved.name).toBe('Proper Name')
    expect(resolved.email).toBe('proper@email.com')
  })

  it('mailmapFromRepository reads .mailmap file', async () => {
    const { dir } = await initRepoWithCommit()
    fs.writeFileSync(join(dir, '.mailmap'), 'Real Name <real@e.com> <fake@e.com>\n')
    const mm = await git.mailmapFromRepository({ fs, dir })
    const resolved = mm.resolve('Fake', 'fake@e.com')
    expect(resolved.name).toBe('Real Name')
    expect(resolved.email).toBe('real@e.com')
  })

  it('mailmapResolve convenience function works', () => {
    const mm = new git.Mailmap()
    mm.addEntry({ realName: 'A', realEmail: 'a@b.com', replaceEmail: 'x@y.com' })
    const result = git.mailmapResolve({ mailmap: mm, name: 'X', email: 'x@y.com' })
    expect(result.name).toBe('A')
  })

  it('Mailmap is case-insensitive on email', () => {
    const mm = new git.Mailmap()
    mm.addEntry({ realName: 'Correct', replaceEmail: 'Test@Example.COM' })
    const resolved = mm.resolve('Old', 'test@example.com')
    expect(resolved.name).toBe('Correct')
  })
})

// ===== ODB Extended =====
describe('odbExt', () => {
  afterEach(() => {
    git.odbClearBackends({ gitdir: 'test-gitdir' })
  })

  it('odbAddBackend and odbListBackends work', () => {
    const backend = { read: async () => null, exists: async () => false }
    git.odbAddBackend({ gitdir: 'test-gitdir', backend, priority: 5 })
    const list = git.odbListBackends({ gitdir: 'test-gitdir' })
    expect(list).toHaveLength(1)
    expect(list[0].priority).toBe(5)
  })

  it('odbClearBackends removes all backends', () => {
    const backend = { read: async () => null, exists: async () => false }
    git.odbAddBackend({ gitdir: 'test-gitdir', backend })
    git.odbClearBackends({ gitdir: 'test-gitdir' })
    expect(git.odbListBackends({ gitdir: 'test-gitdir' })).toHaveLength(0)
  })

  it('odbRead falls back to default storage', async () => {
    const { dir } = await initRepoWithCommit()
    const blobOid = await git.writeBlob({ fs, dir, blob: Buffer.from('test content') })
    const result = await git.odbRead({ fs, dir, oid: blobOid })
    expect(result.object.toString('utf8')).toBe('test content')
  })

  it('odbWrite writes via default storage', async () => {
    const { dir } = await initRepoWithCommit()
    const oid = await git.odbWrite({ fs, dir, type: 'blob', object: Buffer.from('odb content') })
    expect(oid).toMatch(/^[0-9a-f]{40}$/)
    const result = await git.odbRead({ fs, dir, oid })
    expect(result.object.toString('utf8')).toBe('odb content')
  })

  it('odbExists checks default storage', async () => {
    const { dir } = await initRepoWithCommit()
    const blobOid = await git.writeBlob({ fs, dir, blob: Buffer.from('exists test') })
    expect(await git.odbExists({ fs, dir, oid: blobOid })).toBe(true)
    expect(await git.odbExists({ fs, dir, oid: '0000000000000000000000000000000000000000' })).toBe(false)
  })
})

// ===== Refspec edge cases =====
describe('refspecParse edge cases', () => {
  it('returns null for empty input', () => {
    expect(git.refspecParse('')).toBeNull()
    expect(git.refspecParse(null)).toBeNull()
  })

  it('handles src-only refspec', () => {
    const result = git.refspecParse('refs/heads/main')
    expect(result.src).toBe('refs/heads/main')
    expect(result.dst).toBe('')
  })
})
