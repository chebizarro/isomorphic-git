// @ts-check
import '../typedefs.js'

import { GitConfigManager } from '../managers/GitConfigManager.js'
import { GitIndexManager } from '../managers/GitIndexManager.js'
import { GitRefManager } from '../managers/GitRefManager.js'
import { FileSystem } from '../models/FileSystem.js'
import { _readObject } from '../storage/readObject.js'
import { _writeObject } from '../storage/writeObject.js'
import { assertParameter } from '../utils/assertParameter.js'
import { discoverGitdir } from '../utils/discoverGitdir.js'
import { join } from '../utils/join.js'

/**
 * Submodule status flags matching libgit2's git_submodule_status_t
 */
export const SUBMODULE_STATUS = Object.freeze({
  IN_HEAD: 1 << 0,
  IN_INDEX: 1 << 1,
  IN_CONFIG: 1 << 2,
  IN_WD: 1 << 3,
  INDEX_ADDED: 1 << 4,
  INDEX_DELETED: 1 << 5,
  INDEX_MODIFIED: 1 << 6,
  WD_UNINITIALIZED: 1 << 7,
  WD_ADDED: 1 << 8,
  WD_DELETED: 1 << 9,
  WD_MODIFIED: 1 << 10,
})

/**
 * Parse .gitmodules file content into a map of submodule configs.
 * @private
 */
function parseGitmodules(content) {
  const submodules = new Map()
  if (!content) return submodules

  let currentName = null
  for (const rawLine of content.split('\n')) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue

    const sectionMatch = line.match(/^\[submodule\s+"(.+)"\]$/)
    if (sectionMatch) {
      currentName = sectionMatch[1]
      if (!submodules.has(currentName)) {
        submodules.set(currentName, { name: currentName })
      }
      continue
    }

    if (currentName) {
      const kvMatch = line.match(/^(\w+)\s*=\s*(.*)$/)
      if (kvMatch) {
        const [, key, value] = kvMatch
        submodules.get(currentName)[key.toLowerCase()] = value.trim()
      }
    }
  }

  return submodules
}

/**
 * Read and parse the .gitmodules file from the working directory.
 * @private
 */
async function readGitmodules(fs, dir) {
  try {
    const content = await fs.read(join(dir, '.gitmodules'), { encoding: 'utf8' })
    return parseGitmodules(content)
  } catch (e) {
    return new Map()
  }
}

/**
 * Read .gitmodules from a tree OID (for HEAD comparisons).
 * @private
 */
async function readGitmodulesFromTree(fs, cache, gitdir) {
  try {
    const headOid = await GitRefManager.resolve({ fs, gitdir, ref: 'HEAD' })
    const { object: commitObj } = await _readObject({ fs, cache, gitdir, oid: headOid })
    const commit = commitObj.toString('utf8')
    const treeMatch = commit.match(/^tree ([0-9a-f]{40})/m)
    if (!treeMatch) return new Map()

    const { object: treeObj } = await _readObject({ fs, cache, gitdir, oid: treeMatch[1] })
    // Parse tree entries to find .gitmodules
    const entries = parseTreeEntries(treeObj)
    const gmEntry = entries.find(e => e.path === '.gitmodules')
    if (!gmEntry) return new Map()

    const { object: blob } = await _readObject({ fs, cache, gitdir, oid: gmEntry.oid })
    return parseGitmodules(blob.toString('utf8'))
  } catch (e) {
    return new Map()
  }
}

/**
 * Minimal tree entry parser.
 * @private
 */
function parseTreeEntries(buffer) {
  const entries = []
  let i = 0
  while (i < buffer.length) {
    const spaceIdx = buffer.indexOf(0x20, i)
    if (spaceIdx === -1) break
    const mode = buffer.slice(i, spaceIdx).toString('utf8')
    const nullIdx = buffer.indexOf(0x00, spaceIdx + 1)
    if (nullIdx === -1) break
    const path = buffer.slice(spaceIdx + 1, nullIdx).toString('utf8')
    const oid = buffer.slice(nullIdx + 1, nullIdx + 21).toString('hex')
    entries.push({ mode, path, oid })
    i = nullIdx + 21
  }
  return entries
}

/**
 * List all submodules defined in .gitmodules.
 * Equivalent to libgit2's `git_submodule_foreach`.
 *
 * @param {object} args
 * @param {FsClient} args.fs - a file system client
 * @param {string} [args.dir] - The working tree directory path
 * @param {string} [args.gitdir=join(dir, '.git')] - The git directory path
 * @param {object} [args.cache] - a cache object
 * @returns {Promise<Array<{name: string, path: string, url: string, branch?: string}>>}
 */
export async function submoduleList({
  fs: _fs,
  dir,
  gitdir = join(dir, '.git'),
  cache = {},
}) {
  try {
    assertParameter('fs', _fs)
    assertParameter('dir', dir)
    assertParameter('gitdir', gitdir)
    const fs = new FileSystem(_fs)
    const updatedGitdir = await discoverGitdir({ fsp: fs, dotgit: gitdir })

    const submodules = await readGitmodules(fs, dir)
    const result = []
    for (const [name, config] of submodules) {
      result.push({
        name,
        path: config.path || name,
        url: config.url || '',
        branch: config.branch || undefined,
      })
    }
    return result
  } catch (err) {
    err.caller = 'git.submoduleList'
    throw err
  }
}

/**
 * Get configuration and status for a specific submodule.
 * Equivalent to libgit2's `git_submodule_lookup` + `git_submodule_status`.
 *
 * @param {object} args
 * @param {FsClient} args.fs - a file system client
 * @param {string} [args.dir] - The working tree directory path
 * @param {string} [args.gitdir=join(dir, '.git')] - The git directory path
 * @param {string} args.path - The submodule path (or name)
 * @param {object} [args.cache] - a cache object
 * @returns {Promise<{name: string, path: string, url: string, branch?: string, headOid: string|null, indexOid: string|null, wdOid: string|null, status: number}>}
 */
export async function submoduleStatus({
  fs: _fs,
  dir,
  gitdir = join(dir, '.git'),
  path: submodulePath,
  cache = {},
}) {
  try {
    assertParameter('fs', _fs)
    assertParameter('dir', dir)
    assertParameter('gitdir', gitdir)
    assertParameter('path', submodulePath)
    const fs = new FileSystem(_fs)
    const updatedGitdir = await discoverGitdir({ fsp: fs, dotgit: gitdir })

    // Load config from .gitmodules
    const submodules = await readGitmodules(fs, dir)

    // Find by path or name
    let config = null
    for (const [name, cfg] of submodules) {
      if (cfg.path === submodulePath || name === submodulePath) {
        config = cfg
        break
      }
    }

    let status = 0
    const smPath = config ? (config.path || config.name) : submodulePath

    // Check IN_CONFIG
    if (config) {
      status |= SUBMODULE_STATUS.IN_CONFIG
    }

    // Check IN_INDEX (submodule entry in index has mode 160000)
    let indexOid = null
    await GitIndexManager.acquire(
      { fs, gitdir: updatedGitdir, cache, allowUnmerged: true },
      async function(index) {
        const entry = index.entriesMap.get(smPath)
        if (entry && (entry.mode === 0o160000 || entry.mode === 57344)) {
          status |= SUBMODULE_STATUS.IN_INDEX
          indexOid = entry.oid
        }
      }
    )

    // Check IN_HEAD (submodule in HEAD tree)
    let headOid = null
    const headModules = await readGitmodulesFromTree(fs, cache, updatedGitdir)
    // Also check if the path appears as a commit entry in the HEAD tree
    try {
      const headRef = await GitRefManager.resolve({ fs, gitdir: updatedGitdir, ref: 'HEAD' })
      const { object: commitBuf } = await _readObject({ fs, cache, gitdir: updatedGitdir, oid: headRef })
      const treeMatch = commitBuf.toString('utf8').match(/^tree ([0-9a-f]{40})/m)
      if (treeMatch) {
        headOid = await findSubmoduleOidInTree(fs, cache, updatedGitdir, treeMatch[1], smPath)
        if (headOid) {
          status |= SUBMODULE_STATUS.IN_HEAD
        }
      }
    } catch (e) {
      // no HEAD — empty repo
    }

    // Check IN_WD and WD status
    let wdOid = null
    const wdGitdir = join(dir, smPath, '.git')
    try {
      const stat = await fs.stat(join(dir, smPath))
      if (stat.isDirectory()) {
        status |= SUBMODULE_STATUS.IN_WD

        // Try to read HEAD of the submodule
        try {
          const subFs = fs
          const subGitdir = await resolveSubmoduleGitdir(fs, join(dir, smPath))
          const headContent = await fs.read(join(subGitdir, 'HEAD'), { encoding: 'utf8' })
          if (headContent) {
            const trimmed = headContent.trim()
            if (trimmed.match(/^[0-9a-f]{40}$/)) {
              wdOid = trimmed
            } else if (trimmed.startsWith('ref:')) {
              const ref = trimmed.slice(4).trim()
              try {
                const refContent = await fs.read(join(subGitdir, ref), { encoding: 'utf8' })
                if (refContent) wdOid = refContent.trim()
              } catch (e) {
                // check packed-refs
              }
            }
          }

          // Check if WD_MODIFIED (submodule HEAD != index OID)
          if (indexOid && wdOid && indexOid !== wdOid) {
            status |= SUBMODULE_STATUS.WD_MODIFIED
          }
        } catch (e) {
          // .git doesn't exist in submodule dir => uninitialized
          status |= SUBMODULE_STATUS.WD_UNINITIALIZED
        }
      }
    } catch (e) {
      // submodule directory doesn't exist
      if (status & SUBMODULE_STATUS.IN_INDEX) {
        status |= SUBMODULE_STATUS.WD_DELETED
      }
    }

    // INDEX_ADDED / INDEX_DELETED / INDEX_MODIFIED
    if ((status & SUBMODULE_STATUS.IN_INDEX) && !(status & SUBMODULE_STATUS.IN_HEAD)) {
      status |= SUBMODULE_STATUS.INDEX_ADDED
    }
    if (!(status & SUBMODULE_STATUS.IN_INDEX) && (status & SUBMODULE_STATUS.IN_HEAD)) {
      status |= SUBMODULE_STATUS.INDEX_DELETED
    }
    if (headOid && indexOid && headOid !== indexOid) {
      status |= SUBMODULE_STATUS.INDEX_MODIFIED
    }

    return {
      name: config ? config.name : submodulePath,
      path: smPath,
      url: config ? (config.url || '') : '',
      branch: config ? config.branch : undefined,
      headOid,
      indexOid,
      wdOid,
      status,
    }
  } catch (err) {
    err.caller = 'git.submoduleStatus'
    throw err
  }
}

/**
 * Initialize a submodule — copy URL from .gitmodules into .git/config
 * and set up the submodule gitdir.
 * Equivalent to libgit2's `git_submodule_init`.
 *
 * @param {object} args
 * @param {FsClient} args.fs - a file system client
 * @param {string} [args.dir] - The working tree directory path
 * @param {string} [args.gitdir=join(dir, '.git')] - The git directory path
 * @param {string} args.path - The submodule path
 * @param {boolean} [args.overwrite=false] - Overwrite existing config
 * @param {object} [args.cache] - a cache object
 * @returns {Promise<void>}
 */
export async function submoduleInit({
  fs: _fs,
  dir,
  gitdir = join(dir, '.git'),
  path: submodulePath,
  overwrite = false,
  cache = {},
}) {
  try {
    assertParameter('fs', _fs)
    assertParameter('dir', dir)
    assertParameter('gitdir', gitdir)
    assertParameter('path', submodulePath)
    const fs = new FileSystem(_fs)
    const updatedGitdir = await discoverGitdir({ fsp: fs, dotgit: gitdir })

    const submodules = await readGitmodules(fs, dir)

    let config = null
    for (const [name, cfg] of submodules) {
      if (cfg.path === submodulePath || name === submodulePath) {
        config = cfg
        break
      }
    }

    if (!config) {
      throw new Error(`Submodule '${submodulePath}' not found in .gitmodules`)
    }

    // Write submodule config to .git/config
    const gitConfig = await GitConfigManager.get({ fs, gitdir: updatedGitdir })
    const sectionName = `submodule.${config.name}`

    const existingUrl = await gitConfig.get(`${sectionName}.url`)
    if (!existingUrl || overwrite) {
      await gitConfig.set(`${sectionName}.url`, config.url)
    }

    if (config.branch) {
      const existingBranch = await gitConfig.get(`${sectionName}.branch`)
      if (!existingBranch || overwrite) {
        await gitConfig.set(`${sectionName}.branch`, config.branch)
      }
    }

    await GitConfigManager.save({ fs, gitdir: updatedGitdir, config: gitConfig })
  } catch (err) {
    err.caller = 'git.submoduleInit'
    throw err
  }
}

/**
 * De-initialize a submodule — remove its config from .git/config.
 * Equivalent to libgit2's `git_submodule_deinit`.
 *
 * @param {object} args
 * @param {FsClient} args.fs - a file system client
 * @param {string} [args.dir] - The working tree directory path
 * @param {string} [args.gitdir=join(dir, '.git')] - The git directory path
 * @param {string} args.path - The submodule path
 * @param {boolean} [args.force=false] - Force even if the submodule has local modifications
 * @param {object} [args.cache] - a cache object
 * @returns {Promise<void>}
 */
export async function submoduleDeinit({
  fs: _fs,
  dir,
  gitdir = join(dir, '.git'),
  path: submodulePath,
  force = false,
  cache = {},
}) {
  try {
    assertParameter('fs', _fs)
    assertParameter('dir', dir)
    assertParameter('gitdir', gitdir)
    assertParameter('path', submodulePath)
    const fs = new FileSystem(_fs)
    const updatedGitdir = await discoverGitdir({ fsp: fs, dotgit: gitdir })

    const submodules = await readGitmodules(fs, dir)
    let subName = submodulePath
    for (const [name, cfg] of submodules) {
      if (cfg.path === submodulePath) {
        subName = name
        break
      }
    }

    // Remove submodule section from .git/config
    const gitConfig = await GitConfigManager.get({ fs, gitdir: updatedGitdir })

    // GitConfig doesn't have a removeSection, so we remove known keys
    const sectionName = `submodule.${subName}`
    for (const key of ['url', 'branch', 'update', 'active']) {
      await gitConfig.set(`${sectionName}.${key}`, undefined)
    }

    await GitConfigManager.save({ fs, gitdir: updatedGitdir, config: gitConfig })
  } catch (err) {
    err.caller = 'git.submoduleDeinit'
    throw err
  }
}

/**
 * Sync submodule remote URL from .gitmodules to .git/config.
 * Equivalent to libgit2's `git_submodule_sync`.
 *
 * @param {object} args
 * @param {FsClient} args.fs - a file system client
 * @param {string} [args.dir] - The working tree directory path
 * @param {string} [args.gitdir=join(dir, '.git')] - The git directory path
 * @param {string} [args.path] - A specific submodule path, or omit for all
 * @param {object} [args.cache] - a cache object
 * @returns {Promise<void>}
 */
export async function submoduleSync({
  fs: _fs,
  dir,
  gitdir = join(dir, '.git'),
  path: submodulePath,
  cache = {},
}) {
  try {
    assertParameter('fs', _fs)
    assertParameter('dir', dir)
    assertParameter('gitdir', gitdir)
    const fs = new FileSystem(_fs)
    const updatedGitdir = await discoverGitdir({ fsp: fs, dotgit: gitdir })

    const submodules = await readGitmodules(fs, dir)
    const gitConfig = await GitConfigManager.get({ fs, gitdir: updatedGitdir })

    for (const [name, config] of submodules) {
      if (submodulePath && config.path !== submodulePath && name !== submodulePath) continue
      if (config.url) {
        await gitConfig.set(`submodule.${name}.url`, config.url)
      }
    }

    await GitConfigManager.save({ fs, gitdir: updatedGitdir, config: gitConfig })
  } catch (err) {
    err.caller = 'git.submoduleSync'
    throw err
  }
}

/**
 * Add a new submodule to the repository.
 * This updates .gitmodules and stages the submodule in the index.
 * Equivalent to a simplified `git_submodule_add_setup`.
 *
 * Note: This does NOT clone the submodule. Use `git.clone` separately to
 * populate the submodule working directory.
 *
 * @param {object} args
 * @param {FsClient} args.fs - a file system client
 * @param {string} [args.dir] - The working tree directory path
 * @param {string} [args.gitdir=join(dir, '.git')] - The git directory path
 * @param {string} args.url - The remote URL for the submodule
 * @param {string} args.path - The path in the parent repo for the submodule
 * @param {string} [args.branch] - Optional branch to track
 * @param {object} [args.cache] - a cache object
 * @returns {Promise<void>}
 */
export async function submoduleAdd({
  fs: _fs,
  dir,
  gitdir = join(dir, '.git'),
  url,
  path: submodulePath,
  branch,
  cache = {},
}) {
  try {
    assertParameter('fs', _fs)
    assertParameter('dir', dir)
    assertParameter('gitdir', gitdir)
    assertParameter('url', url)
    assertParameter('path', submodulePath)
    const fs = new FileSystem(_fs)
    const updatedGitdir = await discoverGitdir({ fsp: fs, dotgit: gitdir })

    // Read existing .gitmodules
    let content = ''
    try {
      content = await fs.read(join(dir, '.gitmodules'), { encoding: 'utf8' }) || ''
    } catch (e) {
      // file doesn't exist yet
    }

    // Append new submodule section
    const name = submodulePath
    let section = `\n[submodule "${name}"]\n\tpath = ${submodulePath}\n\turl = ${url}\n`
    if (branch) {
      section += `\tbranch = ${branch}\n`
    }

    await fs.write(join(dir, '.gitmodules'), content + section)

    // Also write to .git/config
    const gitConfig = await GitConfigManager.get({ fs, gitdir: updatedGitdir })
    await gitConfig.set(`submodule.${name}.url`, url)
    if (branch) {
      await gitConfig.set(`submodule.${name}.branch`, branch)
    }
    await GitConfigManager.save({ fs, gitdir: updatedGitdir, config: gitConfig })

  } catch (err) {
    err.caller = 'git.submoduleAdd'
    throw err
  }
}

// ---- helpers ----

/**
 * Find a submodule's commit OID within a tree, walking into subdirectories.
 * @private
 */
async function findSubmoduleOidInTree(fs, cache, gitdir, treeOid, filepath) {
  const parts = filepath.split('/')
  let currentTree = treeOid

  for (let i = 0; i < parts.length; i++) {
    const { object: treeBuf } = await _readObject({ fs, cache, gitdir, oid: currentTree })
    const entries = parseTreeEntries(treeBuf)
    const entry = entries.find(e => e.path === parts[i])
    if (!entry) return null

    if (i === parts.length - 1) {
      // Last component — should be the submodule commit entry (mode 160000)
      return entry.mode === '160000' ? entry.oid : null
    }

    // Intermediate — must be a tree
    if (!entry.mode.startsWith('40') && entry.mode !== '40000') return null
    currentTree = entry.oid
  }

  return null
}

/**
 * Resolve the actual gitdir for a submodule (handles .git files that point elsewhere).
 * @private
 */
async function resolveSubmoduleGitdir(fs, smDir) {
  const dotgit = join(smDir, '.git')
  try {
    const stat = await fs.stat(dotgit)
    if (stat.isDirectory()) return dotgit
  } catch (e) {
    // not a directory
  }

  // It might be a file containing "gitdir: <path>"
  try {
    const content = await fs.read(dotgit, { encoding: 'utf8' })
    if (content && content.startsWith('gitdir:')) {
      const relPath = content.slice(7).trim()
      if (relPath.startsWith('/')) return relPath
      return join(smDir, relPath)
    }
  } catch (e) {
    // ignore
  }

  throw new Error(`Not a git repository: ${smDir}`)
}
