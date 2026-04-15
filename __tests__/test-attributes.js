import * as git from 'isomorphic-git'
import * as fs from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const { promises: fsp } = fs

describe('gitattributes', () => {
  let dir

  beforeEach(async () => {
    dir = join(tmpdir(), `test-attrs-${Date.now()}-${Math.random().toString(36).slice(2)}`)
    await fsp.mkdir(dir, { recursive: true })
    await git.init({ fs, dir })
  })

  afterEach(async () => {
    await fsp.rm(dir, { recursive: true, force: true }).catch(() => {})
  })

  it('returns UNSPECIFIED when no .gitattributes exists', async () => {
    const result = await git.getAttr({ fs, dir, filepath: 'foo.txt', attr: 'text' })
    expect(result.type).toBe(git.ATTR_VALUE.UNSPECIFIED)
  })

  it('parses set attribute (TRUE)', async () => {
    await fsp.writeFile(join(dir, '.gitattributes'), '*.txt text\n')
    const result = await git.getAttr({ fs, dir, filepath: 'readme.txt', attr: 'text' })
    expect(result.type).toBe(git.ATTR_VALUE.TRUE)
  })

  it('parses unset attribute (FALSE)', async () => {
    await fsp.writeFile(join(dir, '.gitattributes'), '*.bin -text\n')
    const result = await git.getAttr({ fs, dir, filepath: 'data.bin', attr: 'text' })
    expect(result.type).toBe(git.ATTR_VALUE.FALSE)
  })

  it('parses string value attribute', async () => {
    await fsp.writeFile(join(dir, '.gitattributes'), '*.txt eol=lf\n')
    const result = await git.getAttr({ fs, dir, filepath: 'readme.txt', attr: 'eol' })
    expect(result.type).toBe(git.ATTR_VALUE.STRING)
    expect(result.value).toBe('lf')
  })

  it('parses explicitly unspecified attribute (!)', async () => {
    await fsp.writeFile(join(dir, '.gitattributes'), '*.txt text\nspecial.txt !text\n')
    const result = await git.getAttr({ fs, dir, filepath: 'special.txt', attr: 'text' })
    expect(result.type).toBe(git.ATTR_VALUE.UNSPECIFIED)
  })

  it('later rules override earlier rules', async () => {
    await fsp.writeFile(join(dir, '.gitattributes'), '*.txt text\n*.txt -text\n')
    const result = await git.getAttr({ fs, dir, filepath: 'readme.txt', attr: 'text' })
    expect(result.type).toBe(git.ATTR_VALUE.FALSE)
  })

  it('getAttrMany returns multiple attributes', async () => {
    await fsp.writeFile(join(dir, '.gitattributes'), '*.c text diff=cpp\n')
    const result = await git.getAttrMany({ fs, dir, filepath: 'main.c', attrs: ['text', 'diff'] })
    expect(result.text.type).toBe(git.ATTR_VALUE.TRUE)
    expect(result.diff.type).toBe(git.ATTR_VALUE.STRING)
    expect(result.diff.value).toBe('cpp')
  })

  it('getAttrAll returns all matching attributes', async () => {
    await fsp.writeFile(join(dir, '.gitattributes'), '*.c text diff=cpp linguist-language=C\n')
    const result = await git.getAttrAll({ fs, dir, filepath: 'main.c' })
    expect(Object.keys(result)).toContain('text')
    expect(Object.keys(result)).toContain('diff')
    expect(Object.keys(result)).toContain('linguist-language')
  })

  it('reads .git/info/attributes', async () => {
    await fsp.mkdir(join(dir, '.git', 'info'), { recursive: true })
    await fsp.writeFile(join(dir, '.git', 'info', 'attributes'), '*.log binary\n')
    const result = await git.getAttr({ fs, dir, filepath: 'app.log', attr: 'binary' })
    expect(result.type).toBe(git.ATTR_VALUE.TRUE)
  })

  it('subdirectory .gitattributes takes priority', async () => {
    await fsp.writeFile(join(dir, '.gitattributes'), '*.txt text\n')
    await fsp.mkdir(join(dir, 'docs'), { recursive: true })
    await fsp.writeFile(join(dir, 'docs', '.gitattributes'), '*.txt -text\n')
    const result = await git.getAttr({ fs, dir, filepath: 'docs/readme.txt', attr: 'text' })
    expect(result.type).toBe(git.ATTR_VALUE.FALSE)
  })

  it('does not match unrelated files', async () => {
    await fsp.writeFile(join(dir, '.gitattributes'), '*.txt text\n')
    const result = await git.getAttr({ fs, dir, filepath: 'image.png', attr: 'text' })
    expect(result.type).toBe(git.ATTR_VALUE.UNSPECIFIED)
  })

  it('supports multiple attributes per pattern', async () => {
    await fsp.writeFile(join(dir, '.gitattributes'), '*.png binary -diff\n')
    const result = await git.getAttrMany({ fs, dir, filepath: 'icon.png', attrs: ['binary', 'diff'] })
    expect(result.binary.type).toBe(git.ATTR_VALUE.TRUE)
    expect(result.diff.type).toBe(git.ATTR_VALUE.FALSE)
  })
})
