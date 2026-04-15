# New API Reference — libgit2 Parity

This document provides a quick reference for all APIs added as part of the libgit2 parity effort. For the original APIs (add, commit, clone, push, etc.), see the existing documentation.

All functions follow the standard isomorphic-git convention: `{ fs, dir, gitdir, ...options }`.

---

## Repository Introspection

### `repositoryState({ fs, dir, gitdir? })`
Returns the current repository state as a string from `REPOSITORY_STATE`:
`'NONE'`, `'MERGE'`, `'REBASE_INTERACTIVE'`, `'REBASE_MERGE'`, `'REBASE'`, `'APPLY_MAILBOX'`, `'APPLY_MAILBOX_OR_REBASE'`, `'CHERRY_PICK'`, `'REVERT'`, `'BISECT'`

### `repositoryStateCleanup({ fs, dir, gitdir? })`
Clean up in-progress state files (rebase-apply, rebase-merge, MERGE_HEAD, etc.).

### `isBare({ fs, dir, gitdir? })` → `Promise<boolean>`
### `isEmpty({ fs, dir, gitdir? })` → `Promise<boolean>`
### `isShallow({ fs, dir, gitdir? })` → `Promise<boolean>`
### `isHeadDetached({ fs, dir, gitdir? })` → `Promise<boolean>`
### `isHeadUnborn({ fs, dir, gitdir? })` → `Promise<boolean>`

---

## Index Conflicts

### `indexHasConflicts({ fs, dir, gitdir? })` → `Promise<boolean>`
### `indexConflictGet({ fs, dir, gitdir?, filepath })` → `Promise<{ ancestor?, ours?, theirs? }>`
Each entry has `{ oid, mode, path }`.

### `indexConflictAdd({ fs, dir, gitdir?, filepath, ancestor?, ours?, theirs? })`
Add conflict entries. Each of ancestor/ours/theirs has `{ oid, mode }`.

### `indexConflictRemove({ fs, dir, gitdir?, filepath })`
### `indexConflictIterator({ fs, dir, gitdir? })` → `Promise<Array<{ filepath, ancestor?, ours?, theirs? }>>`
### `indexConflictCleanup({ fs, dir, gitdir? })`
Remove all conflict entries.

---

## Gitattributes

### `getAttr({ fs, dir, gitdir?, filepath, attr })` → `Promise<string|boolean|null>`
### `getAttrMany({ fs, dir, gitdir?, filepath, attrs })` → `Promise<Object>`
### `getAttrAll({ fs, dir, gitdir?, filepath })` → `Promise<Object>`

Constants: `ATTR_VALUE.UNSPECIFIED`, `ATTR_VALUE.TRUE`, `ATTR_VALUE.FALSE`, `ATTR_VALUE.STRING`

---

## Submodules

### `submoduleList({ fs, dir, gitdir? })` → `Promise<string[]>`
### `submoduleStatus({ fs, dir, gitdir?, path })` → `Promise<number>`
Status is a bitmask of `SUBMODULE_STATUS` flags.

### `submoduleInit({ fs, dir, gitdir?, path })`
### `submoduleDeinit({ fs, dir, gitdir?, path })`
### `submoduleSync({ fs, dir, gitdir?, path? })`
### `submoduleAdd({ fs, dir, gitdir?, url, path, gitmodules? })`

---

## Merge Analysis

### `mergeAnalysis({ fs, dir, gitdir?, theirs })` → `Promise<{ analysis, preference }>`
- `analysis`: Bitmask of `MERGE_ANALYSIS.NONE`, `NORMAL`, `UP_TO_DATE`, `FASTFORWARD`, `UNBORN`
- `preference`: `MERGE_PREFERENCE.NONE`, `NO_FASTFORWARD`, `FASTFORWARD_ONLY`

---

## Content Filters

### `applyFilter({ fs, dir, gitdir?, filepath, content, mode, onFilter? })` → `Promise<Uint8Array>`
- `mode`: `FILTER_MODE.TO_WORKTREE` or `FILTER_MODE.TO_ODB`
- `onFilter`: Custom filter callback `(filepath, content) => content`

### `filterList({ fs, dir, gitdir?, filepath })` → `Promise<string[]>`

---

## Revision Walking

### `revwalk({ fs, dir, gitdir?, include, exclude?, sort?, firstParentOnly?, count?, map?, cache? })`
- `include`: Array of refs/OIDs to start from
- `exclude`: Array of refs/OIDs to hide
- `sort`: `SORT.NONE`, `SORT.TOPOLOGICAL`, `SORT.TIME`, `SORT.REVERSE` (can be OR'd)
- `map`: Optional `(oid) => value` callback; return `null` to skip, `undefined` to include OID
- Returns: `Promise<Array>`

---

## Config Extended

### `deleteConfigSection({ fs, dir, gitdir?, section, subsection? })`
### `listConfigSubsections({ fs, dir, gitdir?, section })` → `Promise<string[]>`
### `deleteConfig({ fs, dir, gitdir?, path })` — Delete a config key
### `appendConfig({ fs, dir, gitdir?, path, value })` — Append a multi-value config entry

---

## Commit Extended

### `commitNthAncestor({ fs, dir, gitdir?, oid, depth, cache? })` → `Promise<string>`
Walk `depth` parents up (equivalent to `oid~depth`).

### `commitParent({ fs, dir, gitdir?, oid, parentNumber?, cache? })` → `Promise<string>`
Get a specific parent (0-indexed). Default: first parent.

### `commitHeaderField({ fs, dir, gitdir?, oid, field?, cache? })` → `Promise<string|Object>`
Extract a specific header (`tree`, `parent`, `author`, `committer`, `gpgsig`) or full parsed commit.

---

## Branch Extended

### `branchUpstream({ fs, dir, gitdir?, ref })` → `Promise<string|null>`
### `setBranchUpstream({ fs, dir, gitdir?, ref, remote, merge })`
### `unsetBranchUpstream({ fs, dir, gitdir?, ref })`
### `branchNameIsValid(name)` → `boolean`
### `branchIsHead({ fs, dir, gitdir?, ref })` → `Promise<boolean>`

---

## Diff Extended

### `diffTreeToIndex({ fs, dir, gitdir?, treeOid, cache? })` → `Promise<Array<{ filepath, oldOid, newOid, oldMode, newMode }>>`
### `diffIndexToIndex({ fs, dir, gitdir?, treeOidA, treeOidB, cache? })` → `Promise<Array>`
### `diffBlobs({ fs, dir, gitdir?, oldOid, newOid, cache? })` → `Promise<{ hunks }>`
### `diffPatchId({ fs, dir, gitdir?, oid, cache? })` → `Promise<string>`

---

## Remote Extended

### `renameRemote({ fs, dir, gitdir?, oldName, newName })`
### `setRemoteUrl({ fs, dir, gitdir?, remote, url })`
### `setRemotePushUrl({ fs, dir, gitdir?, remote, url })`
### `remoteDefaultBranch({ fs, dir, gitdir?, remote })` → `Promise<string|null>`

---

## Refs Extended

### `foreachRef({ fs, dir, gitdir?, glob?, callback })`
Callback: `(ref, oid) => void`

### `refNameIsValid(name)` → `boolean`
### `symbolicRefTarget({ fs, dir, gitdir?, ref })` → `Promise<string>`

---

## Graph Analysis

### `graphAheadBehind({ fs, dir, gitdir?, local, upstream, cache? })` → `Promise<{ ahead, behind }>`
### `graphDescendantOf({ fs, dir, gitdir?, oid, ancestor, cache? })` → `Promise<boolean>`

---

## Shallow & Sparse

### `listShallowRoots({ fs, dir, gitdir? })` → `Promise<string[]>`
### `unshallow({ fs, dir, gitdir? })`
### `sparseCheckoutInit({ fs, dir, gitdir? })`
### `sparseCheckoutSet({ fs, dir, gitdir?, patterns })`
### `sparseCheckoutAdd({ fs, dir, gitdir?, patterns })`
### `sparseCheckoutList({ fs, dir, gitdir? })` → `Promise<string[]>`

---

## Tree Operations

### `buildTree({ fs, dir, gitdir?, entries, cache? })` → `Promise<string>`
Entries: `Array<{ mode, path, oid }>`. Returns tree OID.

### `walkTree({ fs, dir, gitdir?, oid, callback, cache? })`
Callback: `(entry) => void` where entry has `{ mode, path, oid, type }`.

### `treeEntryByPath({ fs, dir, gitdir?, oid, filepath, cache? })` → `Promise<{ mode, oid, type }>`

---

## Signature API

### `signatureFromBuffer(buffer)` → `{ name, email, timestamp, timezoneOffset }`
### `signatureCreate({ name, email, timestamp?, timezoneOffset? })` → `Object`
### `signatureDefault({ fs, dir, gitdir? })` → `Promise<Object>`

---

## Ignore Extended

### `ignoreAddRule({ dir, rules })` — Add runtime ignore rules (session-scoped)
### `ignoreClearRules({ dir })` — Clear runtime ignore rules
### `ignorePathIsIgnored({ fs, dir, gitdir?, filepath })` → `Promise<boolean>`

---

## Reflog Management

### `deleteReflog({ fs, dir, gitdir?, ref })`
### `dropReflogEntry({ fs, dir, gitdir?, ref, index })` — Drop entry by index (0 = newest)
### `renameReflog({ fs, dir, gitdir?, oldRef, newRef })`

---

## Atomic Transactions

### `refTransaction({ fs, dir, gitdir?, updates })`
Updates: `Array<{ ref, oid?, symbolic?, delete? }>`. All applied atomically with lock files.

---

## Pathspec

### `new Pathspec(patterns)` / `pathspecNew(patterns)` → `Pathspec`
### `pathspec.matches(filepath)` → `boolean`
### `pathspec.filter(paths)` → `string[]`
### `pathspecMatchesPath(patterns, filepath)` → `boolean`

Supports: `*`, `?`, `[chars]`, `**`, `!negation`, prefix matching.

---

## Blob Extended

### `blobIsBinary({ fs, dir, gitdir?, oid, cache? })` → `Promise<boolean>`
Uses git's null-byte heuristic (first 8000 bytes).

### `blobSize({ fs, dir, gitdir?, oid, cache? })` → `Promise<number>`
### `blobCreateFromWorkdir({ fs, dir, gitdir?, filepath, cache? })` → `Promise<string>`

---

## Tag Extended

### `tagForeach({ fs, dir, gitdir?, callback, cache? })`
Callback: `(name, oid) => void`

### `tagPeel({ fs, dir, gitdir?, oid, cache? })` → `Promise<{ oid, type }>`
Follows tag chains to the final non-tag object.

### `tagTarget({ fs, dir, gitdir?, oid, cache? })` → `Promise<{ targetOid, targetType, tagName, tagger, message }>`
### `tagCreateFromBuffer({ fs, dir, gitdir?, buffer, force?, cache? })` → `Promise<string>`

---

## Notes Extended

### `noteForeach({ fs, dir, gitdir?, ref?, callback, cache? })`
Callback: `({ annotatedOid, noteOid }) => void`

### `noteRead({ fs, dir, gitdir?, ref?, oid, cache? })` → `Promise<{ note }|null>`
### `noteCreate({ fs, dir, gitdir?, ref?, oid, note, force?, author, committer, cache? })` → `Promise<string>`
### `noteRemove({ fs, dir, gitdir?, ref?, oid, author, committer, cache? })` → `Promise<string>`

---

## Email/Patch

### `emailCreateFromCommit({ fs, dir, gitdir?, oid, patchNumber?, totalPatches?, cache? })` → `Promise<string>`
Generates RFC 2822 mbox-format patch compatible with `git am`.

---

## Refspec

### `refspecParse(refspec)` → `{ force, src, dst, direction }|null`
### `refspecTransform(refspec, name)` → `string|null`
### `refspecSrcMatches(refspec, name)` → `boolean`

---

## Pack Builder

### `packBuilderNew({ fs, dir, gitdir?, cache? })` → `Promise<PackBuilder>`
### `builder.insert(oid)` — Add a single object
### `builder.insertCommit(oid, recursive?)` — Add commit + tree + blobs
### `builder.insertTree(oid)` — Add tree recursively
### `builder.count` → `number`
### `builder.oids` → `string[]`
### `builder.write()` → `Promise<{ filename, packfile }>`

---

## Streaming Indexer

### `indexerNew({ fs, dir, gitdir?, onProgress?, cache? })` → `Promise<Indexer>`
### `indexer.append(data)` — Append pack data chunk
### `indexer.commit()` → `Promise<{ oids }>` — Finalize and index

---

## Mailmap

### `new Mailmap()` — Create empty mailmap
### `mailmap.addEntry({ realName?, realEmail?, replaceName?, replaceEmail })`
### `mailmap.addBuffer(content)` — Parse `.mailmap` format
### `mailmap.resolve(name, email)` → `{ name, email }`
### `mailmapFromRepository({ fs, dir })` → `Promise<Mailmap>`
### `mailmapResolve({ mailmap, name, email })` → `{ name, email }`

---

## Custom ODB Backends

### `odbAddBackend({ gitdir, backend, priority? })`
Backend must implement: `read(oid)`, `exists(oid)`, optionally `write(type, object)`.

### `odbClearBackends({ gitdir })`
### `odbListBackends({ gitdir })` → `Array<{ backend, priority }>`
### `odbRead({ fs, dir, gitdir?, oid, cache? })` → `Promise<{ type, object }>`
### `odbWrite({ fs, dir, gitdir?, type, object, cache? })` → `Promise<string>`
### `odbExists({ fs, dir, gitdir?, oid, cache? })` → `Promise<boolean>`
