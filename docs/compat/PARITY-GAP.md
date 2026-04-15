# libgit2 → isomorphic-git Feature Parity Gap Analysis

Updated: 2026-04-15

This document maps every libgit2 public API module (`include/git2/*.h`) to its isomorphic-git equivalent, identifies missing features, behavioral gaps, and categorizes each item by priority and feasibility for a JS/TS environment.

---

## Legend

| Symbol | Meaning |
|--------|---------|
| ✅ | Full parity (or JS-appropriate equivalent) |
| ⚠️ | Partial — exists but has behavioral gaps |
| ❌ | Missing — no equivalent API |
| 🚫 | Not applicable — C/system-level concern not relevant to JS |

---

## 1. API Module Mapping

### Core Object Model

| libgit2 module | isomorphic-git | Status | Notes |
|---|---|---|---|
| `blob.h` | `readBlob`, `writeBlob`, `hashBlob`, `blobIsBinary`, `blobSize`, `blobCreateFromWorkdir` | ✅ | Full parity including binary detection and raw size |
| `commit.h` | `readCommit`, `writeCommit`, `commit`, `commitNthAncestor`, `commitParent`, `commitHeaderField` | ✅ | Extended with ancestor traversal and header extraction |
| `tree.h` | `readTree`, `writeTree`, `buildTree`, `walkTree`, `treeEntryByPath` | ✅ | Full parity with tree builder and walker |
| `tag.h` | `readTag`, `writeTag`, `tag`, `annotatedTag`, `deleteTag`, `listTags`, `tagForeach`, `tagPeel`, `tagTarget`, `tagCreateFromBuffer` | ✅ | Full parity including iteration, peeling, and raw creation |
| `object.h` | `readObject`, `writeObject` | ✅ | |
| `oid.h` | `expandOid` + internal shasum | ✅ | |
| `signature.h` | `signatureFromBuffer`, `signatureCreate`, `signatureDefault` | ✅ | Full parity with buffer parsing and defaults |

### References & Branches

| libgit2 module | isomorphic-git | Status | Notes |
|---|---|---|---|
| `refs.h` | `resolveRef`, `expandRef`, `deleteRef`, `writeRef`, `listRefs`, `foreachRef`, `refNameIsValid`, `symbolicRefTarget` | ✅ | Full parity including iteration and validation |
| `branch.h` | `branch`, `deleteBranch`, `renameBranch`, `listBranches`, `currentBranch`, `branchUpstream`, `setBranchUpstream`, `unsetBranchUpstream`, `branchNameIsValid`, `branchIsHead` | ✅ | Full parity including upstream tracking |
| `refspec.h` | `refspecParse`, `refspecTransform`, `refspecSrcMatches` | ✅ | Full parity with parse/transform/match |
| `reflog.h` | `readReflog`, `deleteReflog`, `dropReflogEntry`, `renameReflog` | ✅ | Full parity including read, delete, drop, rename |
| `annotated_commit.h` | — | 🚫 | C-level type wrapping; JS uses OID strings directly. |
| `transaction.h` | `refTransaction` | ✅ | Atomic ref updates with lock files |

### Repository & Config

| libgit2 module | isomorphic-git | Status | Notes |
|---|---|---|---|
| `repository.h` | `init`, `findRoot`, `repositoryState`, `repositoryStateCleanup`, `isBare`, `isEmpty`, `isShallow`, `isHeadDetached`, `isHeadUnborn`, `REPOSITORY_STATE` | ✅ | Full parity including state detection (merge, rebase, cherry-pick, revert, bisect) |
| `config.h` | `getConfig`, `getConfigAll`, `setConfig`, `deleteConfig`, `appendConfig`, `deleteConfigSection`, `listConfigSubsections` | ✅ | Full parity including section management |
| `ignore.h` | `isIgnored`, `ignoreAddRule`, `ignoreClearRules`, `ignorePathIsIgnored` | ✅ | Full parity including runtime rule management |

### Index & Working Directory

| libgit2 module | isomorphic-git | Status | Notes |
|---|---|---|---|
| `index.h` | `add`, `remove`, `updateIndex`, `resetIndex`, `listFiles`, `GitIndex` model, `indexHasConflicts`, `indexConflictGet`, `indexConflictAdd`, `indexConflictRemove`, `indexConflictIterator`, `indexConflictCleanup` | ✅ | Full parity including conflict entry management |
| `checkout.h` | `checkout` | ⚠️ | Missing: conflict resolution callbacks, notify callbacks, `GIT_CHECKOUT_SKIP_UNMERGED`. |
| `status.h` | `status`, `statusMatrix` | ⚠️ | Missing: rename detection, typechange detection. |

### Diff & Patch

| libgit2 module | isomorphic-git | Status | Notes |
|---|---|---|---|
| `diff.h` | `diffTrees`, `diffFile`, `diffIndexToWorkdir`, `diffStat`, `diffTreeToIndex`, `diffIndexToIndex`, `diffBlobs`, `diffPatchId`, `findRenames`, `DELTA` | ✅ | Full parity including rename detection, stat summaries, blob diffs, and patch IDs |
| `patch.h` | `formatPatch` | ✅ | Patch generation from diffs |
| `apply.h` | `applyPatch` | ✅ | Patch application |
| `email.h` | `emailCreateFromCommit` | ✅ | Mbox-format patch email generation |

### Merge & Conflict Resolution

| libgit2 module | isomorphic-git | Status | Notes |
|---|---|---|---|
| `merge.h` | `merge`, `findMergeBase`, `abortMerge`, `mergeAnalysis`, `MERGE_ANALYSIS`, `MERGE_PREFERENCE` | ✅ | Full parity including merge analysis with preference detection. Has 3-way merge via diff3 and tree merge. |

### History Rewriting

| libgit2 module | isomorphic-git | Status | Notes |
|---|---|---|---|
| `cherrypick.h` | `cherryPick` | ✅ | Full cherry-pick support |
| `rebase.h` | `rebase` | ✅ | Full rebase with init/next/commit/finish/abort |
| `revert.h` | `revert` | ✅ | Full revert support |
| `reset.h` | `reset`, `resetIndex` | ✅ | Supports soft/mixed/hard reset modes |

### Remote Operations

| libgit2 module | isomorphic-git | Status | Notes |
|---|---|---|---|
| `remote.h` | `addRemote`, `deleteRemote`, `listRemotes`, `getRemoteInfo`, `getRemoteInfo2`, `renameRemote`, `setRemoteUrl`, `setRemotePushUrl`, `remoteDefaultBranch` | ✅ | Full parity including rename and URL management |
| `clone.h` | `clone` | ✅ | |
| `fetch.h` (via remote) | `fetch`, `pull`, `fastForward` | ✅ | Compat layer adds libgit2-like validation/progress. |
| `push.h` (via remote) | `push` | ✅ | Compat layer adds error taxonomy. |
| `transport.h` | HTTP node/web transports | ⚠️ | SSH transport not built-in (requires plugin). libgit2 has native SSH. |
| `credential.h` | `onAuth` callbacks | ✅ | |
| `net.h` | — | 🚫 | Low-level network types; not applicable to JS. |
| `proxy.h` | `corsProxy` | ⚠️ | CORS proxy only; no SOCKS/HTTP CONNECT proxy support. |

### Graph & History Traversal

| libgit2 module | isomorphic-git | Status | Notes |
|---|---|---|---|
| `revwalk.h` | `log`, `walk`, `revwalk`, `SORT` | ✅ | Full parity with configurable sort (topological, time, reverse), first-parent-only, include/exclude |
| `graph.h` | `isDescendent`, `findMergeBase`, `graphAheadBehind`, `graphDescendantOf` | ✅ | Full parity including ahead/behind counts |
| `revparse.h` | `revparse` | ✅ | Supports `HEAD~3`, `@{upstream}`, `^2`, range `a..b`, symmetric diff `a...b` |
| `describe.h` | `describe` | ✅ | Full `git describe` support |

### Stash

| libgit2 module | isomorphic-git | Status | Notes |
|---|---|---|---|
| `stash.h` | `stash` (push/pop/apply/drop/list/clear/create) | ⚠️ | Missing: `GIT_STASH_INCLUDE_UNTRACKED`, `GIT_STASH_INCLUDE_IGNORED`, `GIT_STASH_KEEP_ALL`. |

### Attributes & Filters

| libgit2 module | isomorphic-git | Status | Notes |
|---|---|---|---|
| `attr.h` | `getAttr`, `getAttrMany`, `getAttrAll`, `ATTR_VALUE` | ✅ | Full parity with .gitattributes parsing and resolution |
| `filter.h` | `applyFilter`, `filterList`, `FILTER_MODE` | ✅ | Content filter pipeline (text/eol/autocrlf, custom via `onFilter` callback) |

### Pack & Object Database

| libgit2 module | isomorphic-git | Status | Notes |
|---|---|---|---|
| `odb.h` | `odbRead`, `odbWrite`, `odbExists`, `odbAddBackend`, `odbClearBackends`, `odbListBackends` | ✅ | Full parity with custom backend support |
| `pack.h` | `packObjects`, `PackBuilder`, `packBuilderNew` | ✅ | Full parity with incremental pack builder |
| `indexer.h` | `indexPack`, `Indexer`, `indexerNew` | ✅ | Full parity with streaming indexer |

### Notes

| libgit2 module | isomorphic-git | Status | Notes |
|---|---|---|---|
| `notes.h` | `addNote`, `removeNote`, `readNote`, `listNotes`, `noteForeach`, `noteRead`, `noteCreate`, `noteRemove` | ✅ | Full parity including foreach iteration |

### Blame

| libgit2 module | isomorphic-git | Status | Notes |
|---|---|---|---|
| `blame.h` | `blame` | ✅ | Full blame support |

### Submodule

| libgit2 module | isomorphic-git | Status | Notes |
|---|---|---|---|
| `submodule.h` | `submoduleList`, `submoduleStatus`, `submoduleInit`, `submoduleDeinit`, `submoduleSync`, `submoduleAdd`, `SUBMODULE_STATUS` | ✅ | Full lifecycle management |

### Shallow Repository

| libgit2 module | isomorphic-git | Status | Notes |
|---|---|---|---|
| `shallow.h` (via repository) | `isShallow`, `listShallowRoots`, `unshallow` | ✅ | Full parity including root listing and unshallow |

### Sparse Checkout

| libgit2 module | isomorphic-git | Status | Notes |
|---|---|---|---|
| (sparse-checkout) | `sparseCheckoutInit`, `sparseCheckoutSet`, `sparseCheckoutAdd`, `sparseCheckoutList` | ✅ | Full sparse checkout support |

### Email / Message Formatting

| libgit2 module | isomorphic-git | Status | Notes |
|---|---|---|---|
| `email.h` | `emailCreateFromCommit` | ✅ | Mbox-format patch email generation |
| `message.h` | — | ❌ **P3** | Commit message cleanup/trailer parsing. Low priority. |
| `mailmap.h` | `Mailmap`, `mailmapFromRepository`, `mailmapResolve` | ✅ | Full parity with .mailmap parsing and resolution |

### Pathspec

| libgit2 module | isomorphic-git | Status | Notes |
|---|---|---|---|
| `pathspec.h` | `Pathspec`, `pathspecNew`, `pathspecMatchesPath` | ✅ | Full parity with glob, negation, prefix matching |

### Worktree

| libgit2 module | isomorphic-git | Status | Notes |
|---|---|---|---|
| `worktree.h` | — | ❌ **P3** | Multiple working trees. Low demand in JS/browser context. |

### Infrastructure / Not Applicable

| libgit2 module | isomorphic-git | Status | Notes |
|---|---|---|---|
| `global.h` | — | 🚫 | Library init/shutdown; not needed in JS. |
| `common.h` | — | 🚫 | C types/macros. |
| `types.h` | TypeScript types in `backend.ts` | ✅ | |
| `errors.h` | Error classes in `src/errors/` + compat errors | ✅ | |
| `version.h` | `version` API | ✅ | |
| `buffer.h` | — | 🚫 | C buffer management. |
| `strarray.h` | — | 🚫 | C string array management. JS uses native arrays. |
| `oidarray.h` | — | 🚫 | C OID array. JS uses string arrays. |
| `cert.h` | — | 🚫 | TLS certificate types. Handled by Node/browser. |
| `trace.h` | — | 🚫 | Debug tracing. Not needed. |
| `stdint.h` | — | 🚫 | C standard integers. |
| `deprecated.h` | — | 🚫 | Deprecated C API compat shims. |
| `experimental.h` | — | 🚫 | Experimental C features. |
| `refdb.h` / `odb_backend.h` | `odbAddBackend` / custom backend support | ✅ | JS uses pluggable fs + custom ODB backends. |

---

## 2. Coverage Summary

### By Status

| Status | Count | Percentage |
|--------|-------|------------|
| ✅ Full parity | 38 | 84% |
| ⚠️ Partial | 5 | 11% |
| ❌ Missing | 2 | 4% |
| 🚫 Not applicable | 12 | — |

### Remaining Gaps

| Feature | Status | Notes |
|---|---|---|
| `checkout.h` — conflict callbacks | ⚠️ | Missing: conflict resolution callbacks, notify callbacks |
| `status.h` — rename/typechange detection | ⚠️ | Missing: `GIT_STATUS_OPT_RENAMES_*` |
| `stash.h` — untracked/ignored flags | ⚠️ | Missing: `GIT_STASH_INCLUDE_UNTRACKED`, `GIT_STASH_KEEP_ALL` |
| `transport.h` — SSH | ⚠️ | SSH requires external plugin |
| `proxy.h` — SOCKS proxy | ⚠️ | CORS proxy only |
| `message.h` — trailer parsing | ❌ P3 | Commit message cleanup. Low priority. |
| `worktree.h` — multiple worktrees | ❌ P3 | Low demand in JS/browser context. |

---

## 3. Compat Layer Status

The `src/compat/` layer bridges behavioral differences:

| Module | Status | Coverage |
|---|---|---|
| `flag.js` / `flag.ts` | ✅ Aligned | 100% |
| `errors.js` / `errors.ts` | ✅ Aligned | 100% / 98% branch |
| `fetch.js` / `fetch.ts` | ✅ Aligned | 87% / matched |
| `push.js` / `push.ts` | ✅ Aligned | 100% |
| `remote-info.js` / `remote-info.ts` | ✅ Aligned | 100% |
| Adapters (fetch/push/http-transport) | ✅ Tested | 92-100% |

---

## 4. Test Coverage

The libgit2 parity features are tested across 225 test suites with 1628 tests (0 failures):

- **Phase 1** (P1 features): 54 tests — repository state, index conflicts, attributes, submodules
- **Phase 2** (P1/P2 features): 43 tests — merge analysis, filters, revwalk, config ext, commit ext, branch ext
- **Phase 3** (P2/P3 features): 26 tests — diff ext, remote ext, shallow, sparse checkout, refs ext, tree ext, signature, ignore ext
- **Phase 4** (P3/P4 features): 47 tests — reflog ext, transaction, pathspec, blob ext, email, refspec, graph, tag ext, notes ext, pack builder, mailmap, ODB ext
