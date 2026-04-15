# libgit2 → isomorphic-git Feature Parity Gap Analysis

Generated: 2026-04-14

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
| `blob.h` | `readBlob`, `writeBlob`, `hashBlob` | ✅ | |
| `commit.h` | `readCommit`, `writeCommit`, `commit` | ✅ | |
| `tree.h` | `readTree`, `writeTree` | ✅ | |
| `tag.h` | `readTag`, `writeTag`, `tag`, `annotatedTag`, `deleteTag`, `listTags` | ✅ | |
| `object.h` | `readObject`, `writeObject` | ✅ | |
| `oid.h` | `expandOid` + internal shasum | ✅ | |
| `signature.h` | `normalizeAuthorObject`, `normalizeCommitterObject` | ✅ | |

### References & Branches

| libgit2 module | isomorphic-git | Status | Notes |
|---|---|---|---|
| `refs.h` | `resolveRef`, `expandRef`, `deleteRef`, `writeRef`, `listRefs` | ✅ | |
| `branch.h` | `branch`, `deleteBranch`, `renameBranch`, `listBranches`, `currentBranch` | ✅ | |
| `refspec.h` | `GitRefSpec`, `GitRefSpecSet` models | ✅ | |
| `reflog.h` | — | ❌ **P1** | No reflog read/write/append API. Stash uses internal reflog but not exposed. |
| `annotated_commit.h` | — | 🚫 | C-level type wrapping; JS uses OID strings directly. |
| `transaction.h` | — | ❌ **P3** | Atomic ref transactions. JS can use lock files, but no transactional API exposed. |

### Repository & Config

| libgit2 module | isomorphic-git | Status | Notes |
|---|---|---|---|
| `repository.h` | `init`, `findRoot` | ⚠️ | Missing: `git_repository_open_bare`, `git_repository_discover`, `git_repository_state` (merge/rebase in-progress detection). |
| `config.h` | `getConfig`, `getConfigAll`, `setConfig` | ✅ | |
| `ignore.h` | `isIgnored` | ✅ | |

### Index & Working Directory

| libgit2 module | isomorphic-git | Status | Notes |
|---|---|---|---|
| `index.h` | `add`, `remove`, `updateIndex`, `resetIndex`, `listFiles`, `GitIndex` model | ✅ | |
| `checkout.h` | `checkout` | ⚠️ | Missing: conflict resolution callbacks, notify callbacks, `GIT_CHECKOUT_SKIP_UNMERGED`. |
| `status.h` | `status`, `statusMatrix` | ⚠️ | Missing: rename detection, typechange detection. |

### Diff & Patch

| libgit2 module | isomorphic-git | Status | Notes |
|---|---|---|---|
| `diff.h` | — | ❌ **P1** | **Major gap.** No diff API. libgit2 provides: `git_diff_index_to_workdir`, `git_diff_tree_to_tree`, `git_diff_tree_to_index`, rename detection, stat summaries. isomorphic-git uses `walk()` + manual comparison as workaround. |
| `patch.h` | — | ❌ **P2** | No patch object generation from diffs. |
| `apply.h` | — | ❌ **P2** | No patch application (`git apply`). |

### Merge & Conflict Resolution

| libgit2 module | isomorphic-git | Status | Notes |
|---|---|---|---|
| `merge.h` | `merge`, `findMergeBase`, `abortMerge`, `mergeFile`, `mergeTree` | ⚠️ | Has 3-way merge via diff3 and tree merge. Missing: recursive merge strategy, rename detection during merge, `GIT_MERGE_FIND_RENAMES`, octopus merge. |

### History Rewriting

| libgit2 module | isomorphic-git | Status | Notes |
|---|---|---|---|
| `cherrypick.h` | — | ❌ **P1** | No cherry-pick. Critical for workflows. |
| `rebase.h` | — | ❌ **P2** | No rebase (init/next/commit/finish/abort). Complex but high-value. |
| `revert.h` | — | ❌ **P2** | No revert. Can be built on merge infrastructure. |
| `reset.h` | `resetIndex` (path-based only) | ⚠️ **P1** | Missing: `git_reset` (soft/mixed/hard). `resetIndex` only resets individual paths in the index. No HEAD-moving reset. |

### Remote Operations

| libgit2 module | isomorphic-git | Status | Notes |
|---|---|---|---|
| `remote.h` | `addRemote`, `deleteRemote`, `listRemotes`, `getRemoteInfo`, `getRemoteInfo2` | ✅ | |
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
| `revwalk.h` | `log`, `walk` | ✅ | `walk` provides powerful tree-walking; `log` traverses commits. |
| `graph.h` | `isDescendent`, `findMergeBase` | ⚠️ | Missing: `git_graph_ahead_behind` (count divergent commits), `git_graph_reachable_from_any`. |
| `revparse.h` | — | ❌ **P1** | No revision string parsing (`HEAD~3`, `main@{upstream}`, `HEAD^2`, etc.). This is fundamental for CLI-like workflows. |
| `describe.h` | — | ❌ **P3** | No `git describe`. Low priority; primarily a display convenience. |

### Stash

| libgit2 module | isomorphic-git | Status | Notes |
|---|---|---|---|
| `stash.h` | `stash` (push/pop/apply/drop/list/clear/create) | ⚠️ | Missing: `GIT_STASH_INCLUDE_UNTRACKED`, `GIT_STASH_INCLUDE_IGNORED`, `GIT_STASH_KEEP_ALL`. Also no `stash_save_with_opts` advanced options. |

### Attributes & Filters

| libgit2 module | isomorphic-git | Status | Notes |
|---|---|---|---|
| `attr.h` | — | ❌ **P3** | No gitattributes query API. `add` command supports `autocrlf` config but no general attribute resolution. |
| `filter.h` | — | ❌ **P3** | No content filter pipeline (clean/smudge). LFS not supported. |

### Pack & Object Database

| libgit2 module | isomorphic-git | Status | Notes |
|---|---|---|---|
| `odb.h` | Internal `readObject`, `writeObject`, `hasObject` + pack index | ✅ | Not public API but functionally complete. |
| `pack.h` | `packObjects`, `indexPack` | ✅ | |
| `indexer.h` | `indexPack` | ✅ | |

### Notes

| libgit2 module | isomorphic-git | Status | Notes |
|---|---|---|---|
| `notes.h` | `addNote`, `removeNote`, `readNote`, `listNotes` | ✅ | |

### Blame

| libgit2 module | isomorphic-git | Status | Notes |
|---|---|---|---|
| `blame.h` | — | ❌ **P2** | No blame API. Can be built on `log` + diff infrastructure. |

### Submodule

| libgit2 module | isomorphic-git | Status | Notes |
|---|---|---|---|
| `submodule.h` | Partial (read-only submodule awareness in walk/checkout) | ⚠️ | No submodule init/update/sync/add/remove. No recursive submodule operations. |

### Email / Message Formatting

| libgit2 module | isomorphic-git | Status | Notes |
|---|---|---|---|
| `email.h` | — | ❌ **P3** | Patch email formatting. Low priority. |
| `message.h` | — | ❌ **P3** | Commit message cleanup/trailer parsing. Low priority. |
| `mailmap.h` | — | ❌ **P3** | Author/committer name mapping. Low priority. |

### Worktree

| libgit2 module | isomorphic-git | Status | Notes |
|---|---|---|---|
| `worktree.h` | — | ❌ **P3** | Multiple working trees. Low demand in JS/browser context. |

### Pathspec

| libgit2 module | isomorphic-git | Status | Notes |
|---|---|---|---|
| `pathspec.h` | — | ❌ **P3** | Pathspec matching engine. Low-level; `walk` + glob covers most use cases. |

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
| `refdb.h` / `odb_backend.h` | — | 🚫 | Backend extension points. JS uses pluggable fs instead. |

---

## 2. Priority Tiers

### P1 — Critical (blocks "drop-in replacement" claim)

| Feature | Effort | Impact |
|---|---|---|
| **diff** (tree-to-tree, index-to-workdir, stat summary) | Large | Enables blame, cherry-pick, revert, apply, and many workflows |
| **reset** (soft/mixed/hard) | Medium | Fundamental git operation |
| **cherry-pick** | Medium | Essential workflow primitive (depends on merge + diff) |
| **revparse** (`HEAD~3`, `@{upstream}`, `^2`, etc.) | Medium | Required for CLI-like usage and advanced ref resolution |
| **reflog** (read/write/list) | Medium | Required for reset, stash correctness, debugging |
| **graph.ahead_behind** | Small | Needed for status displays and PR-like comparisons |

### P2 — Important (common workflows, high user value)

| Feature | Effort | Impact |
|---|---|---|
| **rebase** (init/next/commit/finish/abort) | Large | High-value but complex; needs cherry-pick first |
| **revert** | Medium | Inverse cherry-pick; depends on merge infrastructure |
| **blame** | Medium | Very common feature; depends on diff |
| **apply** (patch application) | Medium | Needed for rebase, cherry-pick internals |
| **patch** (patch generation from diff) | Medium | Depends on diff |
| **merge: rename detection** | Medium | Quality improvement for merge results |
| **stash: untracked/ignored flags** | Small | Feature completeness |

### P3 — Nice to have (edge cases, low demand in JS)

| Feature | Effort | Impact |
|---|---|---|
| **describe** | Small | Display convenience |
| **attr** (gitattributes query) | Medium | Needed for filter pipeline |
| **filter** (clean/smudge) | Large | LFS support; complex |
| **worktree** | Medium | Low demand in browser/server-side JS |
| **transaction** (atomic ref updates) | Medium | Correctness improvement |
| **pathspec** | Small | Convenience; `walk` covers most cases |
| **mailmap** | Small | Author mapping |
| **email** / **message** | Small | Formatting |
| **submodule** (full CRUD) | Large | Niche but important for monorepos |

---

## 3. Behavioral Gaps in Existing Features

### 3.1 merge — Missing Recursive Strategy

**libgit2**: Supports `GIT_MERGE_ANALYSIS_NORMAL` with recursive strategy, rename detection (`GIT_MERGE_FIND_RENAMES`), and conflict markers with diff3 style.

**isomorphic-git**: Uses simple 3-way merge via `diff3` npm package. No rename detection means renamed files appear as delete+add conflicts instead of clean renames.

**Fix**: Implement rename detection heuristic (compare blob OIDs/similarity) in `mergeTree.js`. Add `mergeDriver` option for custom handling.

### 3.2 checkout — Missing Conflict Callbacks

**libgit2**: `git_checkout_options` includes `notify_cb`, `progress_cb`, conflict and perfdata callbacks.

**isomorphic-git**: Has `onProgress` and `onPostCheckout` but no conflict notification or per-file progress.

**Fix**: Add `onConflict` callback to `checkout` options.

### 3.3 status — No Rename/Typechange Detection

**libgit2**: `git_status_options` includes `GIT_STATUS_OPT_RENAMES_HEAD_TO_INDEX`, `GIT_STATUS_OPT_RENAMES_INDEX_TO_WORKDIR`.

**isomorphic-git**: `statusMatrix` returns per-file status but has no rename or typechange tracking.

**Fix**: Add optional rename detection pass using blob similarity when `detect_renames` option is set.

### 3.4 stash — Missing Flags

**libgit2**: `GIT_STASH_INCLUDE_UNTRACKED`, `GIT_STASH_INCLUDE_IGNORED`, `GIT_STASH_KEEP_INDEX`, `GIT_STASH_KEEP_ALL`.

**isomorphic-git**: Only stashes tracked changes (index + workdir for tracked files). No `includeUntracked` or `keepIndex` options.

**Fix**: Add options to `stash({ op: 'push', includeUntracked, keepIndex })`.

### 3.5 Transport — No Native SSH

**libgit2**: Built-in SSH transport via libssh2.

**isomorphic-git**: HTTP/HTTPS only. SSH requires external plugin.

**Fix**: Document as limitation; provide plugin architecture docs.

---

## 4. Compat Layer Status

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

## 5. Recommended Implementation Order

```
Phase 1 (Foundation):
  reflog → reset (soft/mixed/hard) → revparse → graph.ahead_behind

Phase 2 (Diff Engine):
  diff (tree-to-tree, index-to-workdir) → patch generation

Phase 3 (History Rewriting):
  cherry-pick → revert → rebase

Phase 4 (Quality):
  blame → merge rename detection → status rename detection
  stash flags → checkout conflict callbacks

Phase 5 (Completeness):
  apply → describe → attr → filter → remaining P3 items
```

Each phase builds on the previous. The diff engine (Phase 2) is the keystone — it unblocks blame, cherry-pick, revert, rebase, and apply.
