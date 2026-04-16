/* eslint-env node, browser, jasmine */
import { Errors, addNote, readBlob, resolveRef, readTree } from 'dimorphic-git'

import { makeFixture } from './__helpers__/FixtureFS.js'

describe('addNote', () => {
  it('to a commit', async () => {
    // Setup
    const { fs, gitdir } = await makeFixture('test-addNote')
    // Test
    const oid = await addNote({
      fs,
      gitdir,
      author: {
        name: 'William Hilton',
        email: 'wmhilton@gmail.com',
        timestamp: 1578937310,
        timezoneOffset: 300,
      },
      oid: 'f6d51b1f9a449079f6999be1fb249c359511f164',
      note: 'This is a note about a commit.',
    })
    const commit = await resolveRef({ fs, gitdir, ref: 'refs/notes/commits' })
    expect(commit).toEqual('166e2168a3a5e51df57d1e0fae0c57e0a7063260')
    expect(oid).toEqual('166e2168a3a5e51df57d1e0fae0c57e0a7063260')
    const { blob } = await readBlob({
      fs,
      gitdir,
      oid: '166e2168a3a5e51df57d1e0fae0c57e0a7063260',
      filepath: 'f6d51b1f9a449079f6999be1fb249c359511f164',
    })
    expect(Buffer.from(blob).toString('utf8')).toEqual(
      'This is a note about a commit.'
    )
  })
  it('to a tree', async () => {
    // Setup
    const { fs, gitdir } = await makeFixture('test-addNote')
    // Test
    const oid = await addNote({
      fs,
      gitdir,
      author: {
        name: 'William Hilton',
        email: 'wmhilton@gmail.com',
        timestamp: 1578937310,
        timezoneOffset: 300,
      },
      oid: '199948939a0b95c6f27668689102496574b2c332',
      note: 'This is a note about a tree.',
    })
    const commit = await resolveRef({ fs, gitdir, ref: 'refs/notes/commits' })
    expect(commit).toEqual('fd6b8eb98045307684f55554b31ca87869cea870')
    expect(oid).toEqual('fd6b8eb98045307684f55554b31ca87869cea870')
    const { blob } = await readBlob({
      fs,
      gitdir,
      oid: 'fd6b8eb98045307684f55554b31ca87869cea870',
      filepath: '199948939a0b95c6f27668689102496574b2c332',
    })
    expect(Buffer.from(blob).toString('utf8')).toEqual(
      'This is a note about a tree.'
    )
  })
  it('to a blob', async () => {
    // Setup
    const { fs, gitdir } = await makeFixture('test-addNote')
    // Test
    const oid = await addNote({
      fs,
      gitdir,
      author: {
        name: 'William Hilton',
        email: 'wmhilton@gmail.com',
        timestamp: 1578937310,
        timezoneOffset: 300,
      },
      oid: '68aba62e560c0ebc3396e8ae9335232cd93a3f60',
      note: 'This is a note about a blob.',
    })
    const commit = await resolveRef({ fs, gitdir, ref: 'refs/notes/commits' })
    expect(commit).toEqual('49ca31d127d3f4183d7da5bf06df4157febe3d35')
    expect(oid).toEqual('49ca31d127d3f4183d7da5bf06df4157febe3d35')
    const { blob } = await readBlob({
      fs,
      gitdir,
      oid: '49ca31d127d3f4183d7da5bf06df4157febe3d35',
      filepath: '68aba62e560c0ebc3396e8ae9335232cd93a3f60',
    })
    expect(Buffer.from(blob).toString('utf8')).toEqual(
      'This is a note about a blob.'
    )
  })
  it('consecutive notes accumulate', async () => {
    // Setup
    const { fs, gitdir } = await makeFixture('test-addNote')
    // Test
    {
      const oid = await addNote({
        fs,
        gitdir,
        author: {
          name: 'William Hilton',
          email: 'wmhilton@gmail.com',
          timestamp: 1578937310,
          timezoneOffset: 300,
        },
        oid: 'f6d51b1f9a449079f6999be1fb249c359511f164',
        note: 'This is a note about a commit.',
      })
      const { tree } = await readTree({ fs, gitdir, oid })
      expect(tree.length).toBe(1)
    }
    {
      const oid = await addNote({
        fs,
        gitdir,
        author: {
          name: 'William Hilton',
          email: 'wmhilton@gmail.com',
          timestamp: 1578937310,
          timezoneOffset: 300,
        },
        oid: '199948939a0b95c6f27668689102496574b2c332',
        note: 'This is a note about a tree.',
      })
      const { tree } = await readTree({ fs, gitdir, oid })
      expect(tree.length).toBe(2)
    }
    {
      const oid = await addNote({
        fs,
        gitdir,
        author: {
          name: 'William Hilton',
          email: 'wmhilton@gmail.com',
          timestamp: 1578937310,
          timezoneOffset: 300,
        },
        oid: '68aba62e560c0ebc3396e8ae9335232cd93a3f60',
        note: 'This is a note about a blob.',
      })
      const { tree } = await readTree({ fs, gitdir, oid })
      expect(tree.length).toBe(3)
    }
  })
  it('can add a note to a different branch', async () => {
    // Setup
    const { fs, gitdir } = await makeFixture('test-addNote')
    // Test
    const oid = await addNote({
      fs,
      gitdir,
      ref: 'refs/notes/alt',
      author: {
        name: 'William Hilton',
        email: 'wmhilton@gmail.com',
        timestamp: 1578937310,
        timezoneOffset: 300,
      },
      oid: '68aba62e560c0ebc3396e8ae9335232cd93a3f60',
      note: 'This is a note about a blob.',
    })
    const commit = await resolveRef({ fs, gitdir, ref: 'refs/notes/alt' })
    expect(commit).toEqual('49ca31d127d3f4183d7da5bf06df4157febe3d35')
    expect(oid).toEqual('49ca31d127d3f4183d7da5bf06df4157febe3d35')
    const { blob } = await readBlob({
      fs,
      gitdir,
      oid: '49ca31d127d3f4183d7da5bf06df4157febe3d35',
      filepath: '68aba62e560c0ebc3396e8ae9335232cd93a3f60',
    })
    expect(Buffer.from(blob).toString('utf8')).toEqual(
      'This is a note about a blob.'
    )
  })
  it('throws if note already exists', async () => {
    // Setup
    const { fs, gitdir } = await makeFixture('test-addNote')
    await addNote({
      fs,
      gitdir,
      author: {
        name: 'William Hilton',
        email: 'wmhilton@gmail.com',
        timestamp: 1578937310,
        timezoneOffset: 300,
      },
      oid: 'f6d51b1f9a449079f6999be1fb249c359511f164',
      note: 'This is a note about a commit.',
    })
    // Test
    let error = null
    try {
      await addNote({
        fs,
        gitdir,
        author: {
          name: 'William Hilton',
          email: 'wmhilton@gmail.com',
          timestamp: 1578937310,
          timezoneOffset: 300,
        },
        oid: 'f6d51b1f9a449079f6999be1fb249c359511f164',
        note: 'This is a note about a commit.',
      })
    } catch (err) {
      error = err
    }
    expect(error).not.toBeNull()
    expect(error instanceof Errors.AlreadyExistsError).toBe(true)
  })
  it('replaces existing note with --force', async () => {
    // Setup
    const { fs, gitdir } = await makeFixture('test-addNote')
    await addNote({
      fs,
      gitdir,
      author: {
        name: 'William Hilton',
        email: 'wmhilton@gmail.com',
        timestamp: 1578937310,
        timezoneOffset: 300,
      },
      oid: 'f6d51b1f9a449079f6999be1fb249c359511f164',
      note: 'This is a note about a commit.',
    })
    // Test
    const oid = await addNote({
      fs,
      gitdir,
      author: {
        name: 'William Hilton',
        email: 'wmhilton@gmail.com',
        timestamp: 1578937310,
        timezoneOffset: 300,
      },
      oid: 'f6d51b1f9a449079f6999be1fb249c359511f164',
      note: 'This is the newer note about a commit.',
      force: true,
    })
    const { blob } = await readBlob({
      fs,
      gitdir,
      oid,
      filepath: 'f6d51b1f9a449079f6999be1fb249c359511f164',
    })
    expect(Buffer.from(blob).toString('utf8')).toEqual(
      'This is the newer note about a commit.'
    )
  })
})
