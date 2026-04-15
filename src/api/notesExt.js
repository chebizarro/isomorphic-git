// @ts-check
import '../typedefs.js'

import { _addNote } from '../commands/addNote.js'
import { _listNotes } from '../commands/listNotes.js'
import { _readNote } from '../commands/readNote.js'
import { _removeNote } from '../commands/removeNote.js'
import { FileSystem } from '../models/FileSystem.js'
import { assertParameter } from '../utils/assertParameter.js'
import { discoverGitdir } from '../utils/discoverGitdir.js'
import { join } from '../utils/join.js'
import { normalizeAuthorObject } from '../utils/normalizeAuthorObject.js'
import { normalizeCommitterObject } from '../utils/normalizeCommitterObject.js'

/**
 * Iterate over all notes in a notes ref and call a callback.
 * Equivalent to libgit2's `git_note_foreach`.
 *
 * @param {object} args
 * @param {FsClient} args.fs - a file system client
 * @param {string} [args.dir] - The working tree directory path
 * @param {string} [args.gitdir=join(dir, '.git')] - The git directory path
 * @param {string} [args.ref='refs/notes/commits'] - The notes ref
 * @param {function} args.callback - Called with ({annotatedOid, noteOid}) for each note
 * @param {object} [args.cache] - a cache object
 * @returns {Promise<void>}
 */
export async function noteForeach({
  fs: _fs,
  dir,
  gitdir = join(dir, '.git'),
  ref = 'refs/notes/commits',
  callback,
  cache = {},
}) {
  try {
    assertParameter('fs', _fs)
    assertParameter('gitdir', gitdir)
    assertParameter('callback', callback)
    const fs = new FileSystem(_fs)
    const updatedGitdir = await discoverGitdir({ fsp: fs, dotgit: gitdir })

    const notes = await _listNotes({
      fs,
      cache,
      gitdir: updatedGitdir,
      ref,
    })

    for (const { target: annotatedOid, note: noteOid } of notes) {
      await callback({ annotatedOid, noteOid })
    }
  } catch (err) {
    err.caller = 'git.noteForeach'
    throw err
  }
}

/**
 * Read a note attached to an object, returning it as a string.
 * Convenience wrapper around readNote for libgit2 parity.
 * Equivalent to libgit2's `git_note_read`.
 *
 * @param {object} args
 * @param {FsClient} args.fs - a file system client
 * @param {string} [args.dir] - The working tree directory path
 * @param {string} [args.gitdir=join(dir, '.git')] - The git directory path
 * @param {string} [args.ref='refs/notes/commits'] - The notes ref
 * @param {string} args.oid - The annotated object OID
 * @param {object} [args.cache] - a cache object
 * @returns {Promise<{note: string, noteOid: string}|null>}
 */
export async function noteRead({
  fs: _fs,
  dir,
  gitdir = join(dir, '.git'),
  ref = 'refs/notes/commits',
  oid,
  cache = {},
}) {
  try {
    assertParameter('fs', _fs)
    assertParameter('gitdir', gitdir)
    assertParameter('oid', oid)
    const fs = new FileSystem(_fs)
    const updatedGitdir = await discoverGitdir({ fsp: fs, dotgit: gitdir })

    try {
      const blob = await _readNote({
        fs,
        cache,
        gitdir: updatedGitdir,
        ref,
        oid,
      })
      return {
        note: Buffer.from(blob).toString('utf8'),
      }
    } catch (e) {
      // Note not found
      return null
    }
  } catch (err) {
    err.caller = 'git.noteRead'
    throw err
  }
}

/**
 * Create or update a note on an object.
 * Equivalent to libgit2's `git_note_create`.
 *
 * @param {object} args
 * @param {FsClient} args.fs - a file system client
 * @param {string} [args.dir] - The working tree directory path
 * @param {string} [args.gitdir=join(dir, '.git')] - The git directory path
 * @param {string} [args.ref='refs/notes/commits'] - The notes ref
 * @param {string} args.oid - The object to annotate
 * @param {string} args.note - The note content
 * @param {boolean} [args.force=false] - Overwrite existing note
 * @param {object} [args.author] - Author info
 * @param {object} [args.committer] - Committer info
 * @param {object} [args.cache] - a cache object
 * @returns {Promise<string>} The OID of the new notes commit
 */
export async function noteCreate({
  fs: _fs,
  dir,
  gitdir = join(dir, '.git'),
  ref = 'refs/notes/commits',
  oid,
  note,
  force = false,
  author: _author,
  committer: _committer,
  cache = {},
}) {
  try {
    assertParameter('fs', _fs)
    assertParameter('gitdir', gitdir)
    assertParameter('oid', oid)
    assertParameter('note', note)
    const fs = new FileSystem(_fs)
    const updatedGitdir = await discoverGitdir({ fsp: fs, dotgit: gitdir })

    const author = await normalizeAuthorObject({ fs, gitdir: updatedGitdir, author: _author })
    const committer = await normalizeCommitterObject({
      fs,
      gitdir: updatedGitdir,
      author,
      committer: _committer,
    })

    return await _addNote({
      fs,
      cache,
      gitdir: updatedGitdir,
      ref,
      oid,
      note,
      force,
      author,
      committer,
    })
  } catch (err) {
    err.caller = 'git.noteCreate'
    throw err
  }
}

/**
 * Remove a note from an object.
 * Equivalent to libgit2's `git_note_remove`.
 *
 * @param {object} args
 * @param {FsClient} args.fs - a file system client
 * @param {string} [args.dir] - The working tree directory path
 * @param {string} [args.gitdir=join(dir, '.git')] - The git directory path
 * @param {string} [args.ref='refs/notes/commits'] - The notes ref
 * @param {string} args.oid - The annotated object OID
 * @param {object} [args.author] - Author info
 * @param {object} [args.committer] - Committer info
 * @param {object} [args.cache] - a cache object
 * @returns {Promise<string>} The OID of the new notes commit
 */
export async function noteRemove({
  fs: _fs,
  dir,
  gitdir = join(dir, '.git'),
  ref = 'refs/notes/commits',
  oid,
  author: _author,
  committer: _committer,
  cache = {},
}) {
  try {
    assertParameter('fs', _fs)
    assertParameter('gitdir', gitdir)
    assertParameter('oid', oid)
    const fs = new FileSystem(_fs)
    const updatedGitdir = await discoverGitdir({ fsp: fs, dotgit: gitdir })

    const author = await normalizeAuthorObject({ fs, gitdir: updatedGitdir, author: _author })
    const committer = await normalizeCommitterObject({
      fs,
      gitdir: updatedGitdir,
      author,
      committer: _committer,
    })

    return await _removeNote({
      fs,
      cache,
      gitdir: updatedGitdir,
      ref,
      oid,
      author,
      committer,
    })
  } catch (err) {
    err.caller = 'git.noteRemove'
    throw err
  }
}
