/* eslint-env node, browser, jasmine */
import { myersDiff, generateHunks } from '../src/utils/diff.js'

describe('myersDiff', () => {
  it('returns empty for identical inputs', () => {
    const result = myersDiff(['a', 'b', 'c'], ['a', 'b', 'c'])
    expect(result.every(r => r.type === 'equal')).toBe(true)
    expect(result.flatMap(r => r.lines)).toEqual(['a', 'b', 'c'])
  })

  it('detects insertions', () => {
    const result = myersDiff(['a', 'c'], ['a', 'b', 'c'])
    const types = result.map(r => r.type)
    expect(types).toContain('insert')
    const inserted = result.filter(r => r.type === 'insert')
    expect(inserted.flatMap(r => r.lines)).toEqual(['b'])
  })

  it('detects deletions', () => {
    const result = myersDiff(['a', 'b', 'c'], ['a', 'c'])
    const deleted = result.filter(r => r.type === 'delete')
    expect(deleted.flatMap(r => r.lines)).toEqual(['b'])
  })

  it('handles empty old', () => {
    const result = myersDiff([], ['a', 'b'])
    expect(result.length).toBe(1)
    expect(result[0].type).toBe('insert')
    expect(result[0].lines).toEqual(['a', 'b'])
  })

  it('handles empty new', () => {
    const result = myersDiff(['a', 'b'], [])
    expect(result.length).toBe(1)
    expect(result[0].type).toBe('delete')
    expect(result[0].lines).toEqual(['a', 'b'])
  })

  it('handles both empty', () => {
    expect(myersDiff([], [])).toEqual([])
  })

  it('handles complete replacement', () => {
    const result = myersDiff(['x', 'y'], ['a', 'b'])
    const deleted = result.filter(r => r.type === 'delete').flatMap(r => r.lines)
    const inserted = result.filter(r => r.type === 'insert').flatMap(r => r.lines)
    expect(deleted).toEqual(['x', 'y'])
    expect(inserted).toEqual(['a', 'b'])
  })
})

describe('generateHunks', () => {
  it('returns empty for identical content', () => {
    const hunks = generateHunks('a\nb\nc', 'a\nb\nc')
    expect(hunks).toEqual([])
  })

  it('generates a hunk for a single line change', () => {
    const hunks = generateHunks('a\nb\nc', 'a\nB\nc')
    expect(hunks.length).toBe(1)
    const h = hunks[0]
    expect(h.lines).toContain('-b')
    expect(h.lines).toContain('+B')
    // Context lines
    expect(h.lines).toContain(' a')
    expect(h.lines).toContain(' c')
  })

  it('generates hunks for additions at the end', () => {
    const hunks = generateHunks('a\nb', 'a\nb\nc\nd')
    expect(hunks.length).toBe(1)
    const h = hunks[0]
    expect(h.lines).toContain('+c')
    expect(h.lines).toContain('+d')
  })

  it('generates hunks for deletions at the start', () => {
    const hunks = generateHunks('x\ny\na\nb', 'a\nb')
    expect(hunks.length).toBe(1)
    expect(hunks[0].lines).toContain('-x')
    expect(hunks[0].lines).toContain('-y')
  })

  it('respects contextLines parameter', () => {
    const old = 'a\nb\nc\nd\ne\nf\ng\nh\ni\nj'
    const new_ = 'a\nb\nc\nd\nE\nf\ng\nh\ni\nj'
    const hunks1 = generateHunks(old, new_, 1)
    const hunks3 = generateHunks(old, new_, 3)
    // With 1 context line, hunk should be smaller
    expect(hunks1[0].lines.length).toBeLessThan(hunks3[0].lines.length)
  })

  it('merges nearby changes into a single hunk', () => {
    const old = 'a\nb\nc\nd\ne'
    const new_ = 'A\nb\nc\nd\nE'
    // With context=3, changes at lines 1 and 5 should merge into one hunk
    const hunks = generateHunks(old, new_, 3)
    expect(hunks.length).toBe(1)
  })

  it('splits distant changes into separate hunks', () => {
    // Create content with changes far apart
    const lines = []
    for (let i = 0; i < 20; i++) lines.push(`line${i}`)
    const oldContent = lines.join('\n')
    const newLines = [...lines]
    newLines[0] = 'CHANGED0'
    newLines[19] = 'CHANGED19'
    const newContent = newLines.join('\n')
    const hunks = generateHunks(oldContent, newContent, 1)
    expect(hunks.length).toBe(2)
  })

  it('handles empty old content (new file)', () => {
    const hunks = generateHunks('', 'a\nb\nc')
    expect(hunks.length).toBe(1)
    expect(hunks[0].lines).toContain('+a')
    expect(hunks[0].lines).toContain('+b')
    expect(hunks[0].lines).toContain('+c')
  })

  it('handles empty new content (deleted file)', () => {
    const hunks = generateHunks('a\nb\nc', '')
    expect(hunks.length).toBe(1)
    expect(hunks[0].lines).toContain('-a')
    expect(hunks[0].lines).toContain('-b')
    expect(hunks[0].lines).toContain('-c')
  })
})
