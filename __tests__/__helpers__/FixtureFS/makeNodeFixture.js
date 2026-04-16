import * as _fs from 'fs'
import * as os from 'os'
import { dirname, join, resolve } from 'path'
import { fileURLToPath } from 'url'

import findUp from 'find-up'
import { FileSystem } from 'dimorphic-git/internal-apis'
import onExit from 'signal-exit'

const TEMP_PATH = join(os.tmpdir(), 'jest-fixture-')
const TEMP_DIRS_CREATED = new Set()

async function copyRecursive(src, dst) {
  const stat = await _fs.promises.lstat(src)

  if (stat.isSymbolicLink()) {
    const linkText = await _fs.promises.readlink(src)
    await _fs.promises.symlink(linkText, dst)
    return
  }

  if (stat.isDirectory()) {
    await _fs.promises.mkdir(dst, { recursive: true })
    const entries = await _fs.promises.readdir(src, { withFileTypes: true })

    for (const entry of entries) {
      await copyRecursive(join(src, entry.name), join(dst, entry.name))
    }

    return
  }

  await _fs.promises.copyFile(src, dst)
  await _fs.promises.chmod(dst, stat.mode)
}

export function cleanupTempDirs() {
  for (const tempDir of TEMP_DIRS_CREATED) {
    try {
      _fs.rmSync(tempDir, { recursive: true, force: true })
    } catch (err) {}
  }
  TEMP_DIRS_CREATED.clear()
}

const testsDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')

export async function useTempDir(fixture) {
  const fixturePath = await findUp(join('__fixtures__', fixture), {
    cwd: testsDir,
  })

  const tempDir = await _fs.promises.mkdtemp(TEMP_PATH)
  TEMP_DIRS_CREATED.add(tempDir)

  if (fixturePath) {
    await copyRecursive(fixturePath, tempDir)
  }

  return tempDir
}

export async function makeNodeFixture(fixture) {
  onExit(cleanupTempDirs)

  const fs = new FileSystem(_fs)

  const dir = await useTempDir(fixture)
  const gitdir = await useTempDir(`${fixture}.git`)

  return { _fs, fs, dir, gitdir }
}
