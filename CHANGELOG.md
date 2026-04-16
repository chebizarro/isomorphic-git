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

#### libgit2 Parity — Phase 6: SOCKS Proxy
- **SOCKS proxy**: `proxy` parameter on `clone`, `fetch`, `push`, `pull`, `getRemoteInfo`, `getRemoteInfo2` — routes HTTP traffic through a SOCKS4/5 proxy.
- **Convenience helper**: `createProxyAgent(url)` — creates a `SocksProxyAgent` from a proxy URL string.
- **Flexible input**: `proxy` accepts a URL string (auto-creates agent) or a pre-built `http.Agent` instance.
- **Optional dependency**: `socks-proxy-agent` is an optional peer dependency — only needed for SOCKS proxy support.
- **Wire-through**: Agent flows from public API → commands → `GitRemoteHTTP.discover()`/`.connect()` → `http.request()`.

#### libgit2 Compat Promoted to Default
- **Breaking change**: libgit2-compatible behavior is now **on by default**. No flag needed.
- **Opt-out**: `ISOGIT_LEGACY=1` (or `globalThis.__ISOGIT_LEGACY__ = true` in browsers) restores legacy behavior.
- **Backward compat**: `LIBGIT2_COMPAT=false/0/no/off` also disables compat for pre-existing scripts.
- **Push result**: Compat push result now includes backward-compatible `ok` and `refs` fields alongside the new `updates`/`rejected` fields, so existing push consumers continue to work unchanged.
- **Proxy**: `agent` now correctly flows through compat fetch/push adapters.

#### Compat Layer (from earlier in 2.0.0-alpha cycle)
- JavaScript-only libgit2 compatibility layer under `src/compat/` (now always active).
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
- 228 test suites, 1688 tests, 0 failures.
- 200+ new tests specifically for libgit2 parity features across 6 phases.
- 21 SSH transport tests with mock SSH server covering auth, discovery, and pack exchange.
- 11 SOCKS proxy tests with mock SOCKS5 server covering agent creation, parameter flow, and end-to-end proxying.

### CI
- Compat golden suites run under Karma + ChromeHeadless, Webpack 4, with `NODE_OPTIONS=--openssl-legacy-provider`.
- Workflow: `.github/workflows/compat-tests.yml` executes compat-only and golden suites.

### Notes
- The compat layer preserves the public API; behavior aligns with libgit2 where feasible, without native modules or WASM.
- Error taxonomy codes: `ENONFASTFORWARD`, `EPERM` (incl. protected branch), `ECONFLICT`, `EAUTH`, `ENOTFOUND`, `ECONNECTION`, `EPROTOCOL`, `EUNSUPPORTED`, `EINTERNAL`.

### Migration
- See `UPGRADING.md` for the feature flag, behavior changes, migration checklist, and rollout plan.

[2.0.0-alpha]: https://github.com/dimorphic-git/dimorphic-git/releases/tag/v2.0.0-alpha
