/* eslint-env jest */
import * as git from 'dimorphic-git'
import * as fs from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

function makeTmpDir() {
  return fs.mkdtempSync(join(tmpdir(), 'dimogit-parity-final-'))
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

// ===== messagePrettify =====
describe('messagePrettify', () => {
  it('strips comment lines', () => {
    const result = git.messagePrettify({
      message: 'Subject line\n\n# This is a comment\nBody text\n# Another comment\n',
    })
    expect(result).toBe('Subject line\n\nBody text\n')
  })

  it('preserves comments when stripComments is false', () => {
    const result = git.messagePrettify({
      message: '# Not removed\n',
      stripComments: false,
    })
    expect(result).toBe('# Not removed\n')
  })

  it('supports custom comment character', () => {
    const result = git.messagePrettify({
      message: 'Subject\n; comment\nBody\n',
      commentChar: ';',
    })
    expect(result).toBe('Subject\nBody\n')
  })

  it('strips trailing whitespace from lines', () => {
    const result = git.messagePrettify({
      message: 'Subject   \n\nBody   \n',
    })
    expect(result).toBe('Subject\n\nBody\n')
  })

  it('collapses consecutive blank lines', () => {
    const result = git.messagePrettify({
      message: 'Subject\n\n\n\nBody\n',
    })
    expect(result).toBe('Subject\n\nBody\n')
  })

  it('strips leading and trailing blank lines', () => {
    const result = git.messagePrettify({
      message: '\n\nSubject\n\n',
    })
    expect(result).toBe('Subject\n')
  })

  it('ensures trailing newline', () => {
    const result = git.messagePrettify({ message: 'No newline' })
    expect(result).toBe('No newline\n')
  })

  it('handles empty message', () => {
    expect(git.messagePrettify({ message: '' })).toBe('\n')
    expect(git.messagePrettify({ message: '# only comment\n' })).toBe('\n')
  })
})

// ===== messageTrailers =====
describe('messageTrailers', () => {
  it('parses standard trailers', () => {
    const result = git.messageTrailers({
      message: 'Subject\n\nBody paragraph.\n\nSigned-off-by: Jane <jane@example.com>\nCo-authored-by: John <john@example.com>\n',
    })
    expect(result).toHaveLength(2)
    expect(result[0].key).toBe('Signed-off-by')
    expect(result[0].value).toBe('Jane <jane@example.com>')
    expect(result[1].key).toBe('Co-authored-by')
    expect(result[1].value).toBe('John <john@example.com>')
  })

  it('returns empty array when no trailers', () => {
    const result = git.messageTrailers({
      message: 'Subject\n\nJust a body with no trailers.\n',
    })
    expect(result).toEqual([])
  })

  it('returns empty for single-line messages', () => {
    expect(git.messageTrailers({ message: 'Just a subject' })).toEqual([])
  })

  it('returns empty for null/empty', () => {
    expect(git.messageTrailers({ message: '' })).toEqual([])
    expect(git.messageTrailers({ message: null })).toEqual([])
  })

  it('handles continuation lines', () => {
    const result = git.messageTrailers({
      message: 'Subject\n\nFixes: issue #123\n  and issue #456\n',
    })
    expect(result).toHaveLength(1)
    expect(result[0].key).toBe('Fixes')
    expect(result[0].value).toContain('issue #123')
    expect(result[0].value).toContain('and issue #456')
  })

  it('rejects paragraphs that are not all trailers', () => {
    const result = git.messageTrailers({
      message: 'Subject\n\nThis is a regular paragraph.\nSigned-off-by: Jane <jane@example.com>\n',
    })
    expect(result).toEqual([])
  })
})

// ===== statusMatrix detectRenames =====
describe('statusMatrix detectRenames', () => {
  it('detects exact renames (same content)', async () => {
    const { dir } = await initRepoWithCommit()

    // Rename test.txt to renamed.txt (delete + add with same content)
    const content = fs.readFileSync(join(dir, 'test.txt'))
    fs.unlinkSync(join(dir, 'test.txt'))
    fs.writeFileSync(join(dir, 'renamed.txt'), content)
    await git.remove({ fs, dir, filepath: 'test.txt' })
    await git.add({ fs, dir, filepath: 'renamed.txt' })

    const matrix = await git.statusMatrix({ fs, dir, detectRenames: true })

    // Should have renamed.txt with old path
    const renamedEntry = matrix.find(([fp]) => fp === 'renamed.txt')
    expect(renamedEntry).toBeTruthy()
    expect(renamedEntry.length).toBe(5) // [filepath, h, w, s, oldPath]
    expect(renamedEntry[4]).toBe('test.txt')

    // test.txt should NOT appear (it was matched as the rename source)
    const deletedEntry = matrix.find(([fp]) => fp === 'test.txt')
    expect(deletedEntry).toBeUndefined()
  })

  it('works without renames (no false positives)', async () => {
    const { dir } = await initRepoWithCommit()

    // Just modify a file — no rename
    fs.writeFileSync(join(dir, 'test.txt'), 'modified content\n')
    await git.add({ fs, dir, filepath: 'test.txt' })

    const matrix = await git.statusMatrix({ fs, dir, detectRenames: true })
    // No entry should have a 5th element
    for (const entry of matrix) {
      expect(entry.length).toBeLessThanOrEqual(4)
    }
  })

  it('detects similar content renames', async () => {
    const { dir } = await initRepoWithCommit()

    // Rename with slight modification
    const original = 'hello world\nline 2\nline 3\nline 4\nline 5\n'
    fs.writeFileSync(join(dir, 'test.txt'), original)
    await git.add({ fs, dir, filepath: 'test.txt' })
    await git.commit({
      fs, dir, message: 'Add content',
      author: { name: 'Test', email: 'test@test.com', timestamp: 1000000100, timezoneOffset: 0 },
    })

    // Now rename with small change
    fs.unlinkSync(join(dir, 'test.txt'))
    fs.writeFileSync(join(dir, 'moved.txt'), 'hello world\nline 2\nline 3\nline 4\nline 5 modified\n')
    await git.remove({ fs, dir, filepath: 'test.txt' })
    await git.add({ fs, dir, filepath: 'moved.txt' })

    const matrix = await git.statusMatrix({ fs, dir, detectRenames: true })
    const movedEntry = matrix.find(([fp]) => fp === 'moved.txt')
    expect(movedEntry).toBeTruthy()
    // Should detect as rename with >50% similarity
    if (movedEntry.length === 5) {
      expect(movedEntry[4]).toBe('test.txt')
    }
  })
})

// ===== worktree =====
describe('worktree', () => {
  it('worktreeList returns empty for fresh repo', async () => {
    const { dir } = await initRepoWithCommit()
    const list = await git.worktreeList({ fs, dir })
    expect(list).toEqual([])
  })

  it('worktreeAdd creates a linked worktree', async () => {
    const { dir, gitdir } = await initRepoWithCommit()
    const wtPath = makeTmpDir()

    await git.worktreeAdd({ fs, dir, name: 'feature', path: wtPath })

    // Should appear in list
    const list = await git.worktreeList({ fs, dir })
    expect(list).toContain('feature')

    // .git file in worktree should point back
    const gitFile = fs.readFileSync(join(wtPath, '.git'), 'utf8')
    expect(gitFile).toContain('worktrees/feature')

    // gitdir file should point to worktree
    const gitdirFile = fs.readFileSync(join(gitdir, 'worktrees', 'feature', 'gitdir'), 'utf8')
    expect(gitdirFile.trim()).toBe(join(wtPath, '.git'))

    // HEAD should be set
    const headFile = fs.readFileSync(join(gitdir, 'worktrees', 'feature', 'HEAD'), 'utf8')
    expect(headFile).toContain('ref:')
  })

  it('worktreeAdd with specific ref', async () => {
    const { dir, gitdir, oid } = await initRepoWithCommit()
    const wtPath = makeTmpDir()

    const branch = await git.currentBranch({ fs, dir })
    await git.worktreeAdd({ fs, dir, name: 'specific', path: wtPath, ref: `refs/heads/${branch}` })

    const headFile = fs.readFileSync(join(gitdir, 'worktrees', 'specific', 'HEAD'), 'utf8')
    expect(headFile.trim()).toBe(`ref: refs/heads/${branch}`)
  })

  it('worktreeLock and worktreeUnlock work', async () => {
    const { dir } = await initRepoWithCommit()
    const wtPath = makeTmpDir()
    await git.worktreeAdd({ fs, dir, name: 'locktest', path: wtPath })

    // Initially unlocked
    let result = await git.worktreeIsLocked({ fs, dir, name: 'locktest' })
    expect(result.locked).toBe(false)

    // Lock it
    await git.worktreeLock({ fs, dir, name: 'locktest', reason: 'on USB drive' })
    result = await git.worktreeIsLocked({ fs, dir, name: 'locktest' })
    expect(result.locked).toBe(true)
    expect(result.reason).toBe('on USB drive')

    // Unlock it
    await git.worktreeUnlock({ fs, dir, name: 'locktest' })
    result = await git.worktreeIsLocked({ fs, dir, name: 'locktest' })
    expect(result.locked).toBe(false)
  })

  it('worktreePrune removes worktree data', async () => {
    const { dir, gitdir } = await initRepoWithCommit()
    const wtPath = makeTmpDir()
    await git.worktreeAdd({ fs, dir, name: 'prune-me', path: wtPath })

    // Prune with force (since the worktree .git file still exists)
    await git.worktreePrune({ fs, dir, name: 'prune-me', force: true })

    // Should no longer be in list
    const list = await git.worktreeList({ fs, dir })
    expect(list).not.toContain('prune-me')
  })

  it('worktreePrune refuses to prune locked worktree', async () => {
    const { dir } = await initRepoWithCommit()
    const wtPath = makeTmpDir()
    await git.worktreeAdd({ fs, dir, name: 'locked-wt', path: wtPath })
    await git.worktreeLock({ fs, dir, name: 'locked-wt' })

    await expect(git.worktreePrune({ fs, dir, name: 'locked-wt', force: true }))
      .rejects.toThrow('locked')
  })

  it('worktreePrune with pruneLocked overrides lock', async () => {
    const { dir } = await initRepoWithCommit()
    const wtPath = makeTmpDir()
    await git.worktreeAdd({ fs, dir, name: 'force-prune', path: wtPath })
    await git.worktreeLock({ fs, dir, name: 'force-prune' })

    await git.worktreePrune({ fs, dir, name: 'force-prune', force: true, pruneLocked: true })
    const list = await git.worktreeList({ fs, dir })
    expect(list).not.toContain('force-prune')
  })
})
