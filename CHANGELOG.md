# Changelog

All notable changes to this project will be documented in this file.

The format is based on Keep a Changelog, and this project adheres to Semantic Versioning.

## [2.0.0-alpha]

### Added

#### libgit2 Parity — Phase 1: Core Infrastructure
- **Repository introspection**: `repositoryState`, `repositoryStateCleanup`, `isBare`, `isEmpty`, `isShallow`, `isHeadDetached`, `isHeadUnborn`, `REPOSITORY_STATE` — detect merge/rebase/cherry-pick/revert/bisect in-progress states.
- **Index conflict management**: `indexHasConflicts`, `indexConflictGet`, `indexConflictAdd`, `indexConflictRemove`, `indexConflictIterator`, `indexConflictCleanup` — full conflict entry CRUD.
- **Gitattributes**: `getAttr`, `getAttrMany`, `getAttrAll`, `ATTR_VALUE` — `.gitattributes` parser with pattern matching.
- **Submodule lifecycle**: `submoduleList`, `submoduleStatus`, `submoduleInit`, `submoduleDeinit`, `submoduleSync`, `submoduleAdd`, `SUBMODULE_STATUS` — complete submodule management.

#### libgit2 Parity — Phase 2: Analysis & Traversal
- **Merge analysis**: `mergeAnalysis`, `MERGE_ANALYSIS`, `MERGE_PREFERENCE` — determine merge type (fast-forward, normal, up-to-date, unborn) and ff preference.
- **Content filters**: `applyFilter`, `filterList`, `FILTER_MODE` — smudge/clean filter pipeline with line ending conversion and custom callbacks.
- **Configurable revwalk**: `revwalk`, `SORT` — commit traversal with topological/time/reverse sort, first-parent-only, include/exclude sets.
- **Config extended**: `deleteConfigSection`, `listConfigSubsections`, `deleteConfig`, `appendConfig`.
- **Commit extended**: `commitNthAncestor`, `commitParent`, `commitHeaderField`.
- **Branch extended**: `branchUpstream`, `setBranchUpstream`, `unsetBranchUpstream`, `branchNameIsValid`, `branchIsHead`.

#### libgit2 Parity — Phase 3: Diff, Remote & Refs
- **Diff extended**: `diffTreeToIndex`, `diffIndexToIndex`, `diffBlobs`, `diffPatchId`.
- **Remote extended**: `renameRemote`, `setRemoteUrl`, `setRemotePushUrl`, `remoteDefaultBranch`.
- **Shallow management**: `listShallowRoots`, `unshallow`.
- **Sparse checkout**: `sparseCheckoutInit`, `sparseCheckoutSet`, `sparseCheckoutAdd`, `sparseCheckoutList`.
- **Refs extended**: `foreachRef`, `refNameIsValid`, `symbolicRefTarget`.
- **Tree builder/walker**: `buildTree`, `walkTree`, `treeEntryByPath`.
- **Signature API**: `signatureFromBuffer`, `signatureCreate`, `signatureDefault`.
- **Ignore extended**: `ignoreAddRule`, `ignoreClearRules`, `ignorePathIsIgnored`.

#### libgit2 Parity — Phase 4: Completeness
- **Reflog management**: `deleteReflog`, `dropReflogEntry`, `renameReflog`.
- **Atomic transactions**: `refTransaction` — apply multiple ref updates atomically with lock files.
- **Pathspec matching**: `Pathspec` class, `pathspecNew`, `pathspecMatchesPath` — glob patterns with negation and prefix matching.
- **Blob extended**: `blobIsBinary`, `blobSize`, `blobCreateFromWorkdir`.
- **Email patches**: `emailCreateFromCommit` — RFC 2822 mbox-format patch generation.
- **Refspec operations**: `refspecParse`, `refspecTransform`, `refspecSrcMatches`.
- **Graph analysis**: `graphAheadBehind`, `graphDescendantOf`.
- **Tag extended**: `tagForeach`, `tagPeel`, `tagTarget`, `tagCreateFromBuffer`.
- **Notes extended**: `noteForeach`, `noteRead`, `noteCreate`, `noteRemove`.
- **Pack builder**: `PackBuilder` class, `packBuilderNew` — incremental pack file construction.
- **Streaming indexer**: `Indexer` class, `indexerNew` — streaming packfile indexer.
- **Mailmap**: `Mailmap` class, `mailmapFromRepository`, `mailmapResolve` — author identity mapping.
- **Custom ODB backends**: `odbAddBackend`, `odbClearBackends`, `odbListBackends`, `odbRead`, `odbWrite`, `odbExists`.

#### libgit2 Parity — Phase 5: SSH Transport
- **SSH transport**: `GitRemoteSSH` — full SSH transport via the `ssh2` package, enabling `clone`, `fetch`, and `push` over SSH URLs (`ssh://` and `git@host:path` syntax).
- **Authentication**: password, private key (with optional passphrase), and SSH agent forwarding (via `SSH_AUTH_SOCK`).
- **Wire protocol**: Reuses existing pack protocol handlers; SSH channels speak the same binary format as HTTP smart transport.
- **Optional dependency**: `ssh2` is an optional peer dependency — only needed for SSH transport. Falls back to helpful error message if not installed.
- **Auth callbacks**: Integrates with existing `onAuth`, `onAuthSuccess`, `onAuthFailure` callback pattern.

#### Compat Layer (from earlier in 2.0.0-alpha cycle)
- JavaScript-only libgit2 compatibility layer under `src/compat/` behind `LIBGIT2_COMPAT` flag.
- Golden test suite for compat behavior (remote-info, fetch including matrix variants, push, push error taxonomy).
- JSON truth fixtures for push error mapping at `__tests__/__truth__/push-errors.json`.
- Documentation: `docs/compat/README.md` detailing compat semantics and `UPGRADING.md` with migration guidance.

### Changed
- Remote discovery (`getRemoteInfo2`) returns protocol-literal versions via `protocolVersion` and JSON-safe refs (name, oid, target, peeled) consistent with libgit2 semantics.
- Fetch negotiation and progress are standardized; phases emitted as `negotiation` → `receiving` → `indexing`. Some transports may expose optional result fields (`defaultBranch`, `fetchHead`, `fetchHeadDescription`, `headers`, `pruned`).
- Push result normalized to `{ updates, rejected }`; each failed update may include a standardized `code`.

### Fixed
- TypeScript/JSDoc alignment for compat transports (remote-info protocol literals, widened fetch result shapes).
- Consolidated push error taxonomy with heuristic mapping for common server messages.

### Test Coverage
- 227 test suites, 1677 tests, 0 failures.
- 190+ new tests specifically for libgit2 parity features across 5 phases.
- 21 SSH transport tests with mock SSH server covering auth, discovery, and pack exchange.

### CI
- Compat golden suites run under Karma + ChromeHeadless, Webpack 4, with `NODE_OPTIONS=--openssl-legacy-provider`.
- Workflow: `.github/workflows/compat-tests.yml` executes compat-only and golden suites.

### Notes
- The compat layer preserves the public API; behavior aligns with libgit2 where feasible, without native modules or WASM.
- Error taxonomy codes: `ENONFASTFORWARD`, `EPERM` (incl. protected branch), `ECONFLICT`, `EAUTH`, `ENOTFOUND`, `ECONNECTION`, `EPROTOCOL`, `EUNSUPPORTED`, `EINTERNAL`.

### Migration
- See `UPGRADING.md` for the feature flag, behavior changes, migration checklist, and rollout plan.

[2.0.0-alpha]: https://github.com/isomorphic-git/isomorphic-git/releases/tag/v2.0.0-alpha
