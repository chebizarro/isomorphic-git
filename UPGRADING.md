# Upgrading to the libgit2-compat Release (JS-only)

This major version focuses on aligning runtime semantics and edge cases with libgit2 while **remaining a pure JavaScript implementation**.

## Highlights
- Remote discovery (`getRemoteInfo2`) parses capabilities, symrefs, and peeled refs consistently.
- Fetch negotiation honors shallow variants with improved invariants.
- Push error surfaces are standardized (non-fast-forward, protected refs).

## Potential Breaking Changes
- Error messages consolidated under an internal taxonomy (no API changes expected).
- Ref peeling and `HEAD` resolution follow libgit2-consistent precedence rules.

See `docs/compat/README.md` for detailed behavior notes.

---

## Compatibility Modes and Feature Flag

**libgit2-compatible behavior is the default** as of 2.0.0-alpha. The compat layer (`src/compat/`) is always active unless explicitly opted out.

- Public API is preserved; the compat layer adapts internal behavior and result shapes to match libgit2 semantics.
- Entry points always active:
  - `getRemoteInfo2` → `src/compat/remote-info.js`
  - `fetch` → `src/compat/fetch.js` (via compat transport/adapters)
  - `push` → `src/compat/push.js` (via compat transport/adapters)

### Opting out (legacy mode)

If you need the old pre-2.0 behavior, opt out via:

```sh
# Preferred — explicit legacy flag
ISOGIT_LEGACY=1 node your-script.js

# Backward compat — disable via old flag
LIBGIT2_COMPAT=false node your-script.js
```

In browser environments: `globalThis.__ISOGIT_LEGACY__ = true`

Karma/CI golden suites run with compat active (the default). No flag is needed.

## Behavioral Changes by Area

### Remote Discovery (`getRemoteInfo2`)
- Protocol detection returns literal protocol versions: `1` or `2` via a `protocolVersion` field.
- v2: `{ protocolVersion: 2, capabilities }`.
- v1: `{ protocolVersion: 1, capabilities, refs }` where refs are JSON-safe objects with fields:
  - `ref` (name), `oid`, `symbolic` (symref target refname if any), `peeled` (peeled tag OID if any).
- `HEAD` symref precedence and peeled tag mapping mirror libgit2’s rules.
- In protocol v2, `symref=HEAD:refs/heads/<name>` (when present) is surfaced as `head.symbolic`. Compat does not guess a default branch without explicit symref information.

### Fetch
- Options forwarded: `depth`, `since`, `singleBranch`, `tags`, `prune`, `pruneTags`, `relative`, `exclude`.
- Validation (compat-only, libgit2-like):
  - `depth` must be `null`/`undefined` or a finite number `>= 0`.
  - `since` must be `null`/`undefined` or a `Date`.
  - `depth` and `since` are mutually exclusive (throws `EINVALIDSPEC` when both are provided).
- Normalization: `undefined` values for `depth`/`since` are passed as `null` to maintain legacy compatibility.
- Progress phases are standardized as canonical strings and emitted in order:
  - `negotiation` → `receiving` → `indexing` → `resolving`.
- Result can include additional optional fields exposed by transports: `defaultBranch`, `fetchHead`, `fetchHeadDescription`, `headers`, `pruned`.

### Push
- Result is normalized to:
  - `updates`: Array of `{ ref, ok, message?, code? }` where `code` is a normalized error code when `ok === false`.
  - `rejected`: Array of `ref` names rejected by the remote.
- Per-ref rejections are returned in `{ updates, rejected }` and do not throw in compat mode.
- Only protocol/transport/unpack failures throw (eg authentication/network failures, malformed protocol responses, or remote unpack failure).
- Progress events are forwarded unchanged.

## Standardized Push Error Taxonomy

Push failures are mapped heuristically to stable codes for easier handling and parity with libgit2-like behavior. Implemented in:
- `src/compat/errors.ts` (runtime, TS) and `src/compat/errors.js` (JS shim used in tests/build).
- Codes are attached in compat push adapters (`src/compat/adapters/push-transport.js`) and enforced in `src/compat/push.js`.

Codes and common triggers:

- `ENONFASTFORWARD` — messages containing `non-fast-forward`, `fetch first`.
- `EINVALIDSPEC` — `invalid refspec`, `does not match any`, `not a valid reference`.
- `EUNBORN` — `unborn`, `does not have any commits yet`.
- `ESHORTREAD` — `short read`, `unexpected EOF`, `premature end of pack file`.
- `EPERM` — `hook declined`, `pre-receive hook declined`, `protected branch`.
- `ECONFLICT` — `cannot lock ref`, `lock … exists`, ref lock conflicts.
- `EAUTH` — `Authentication failed`, credential denied/unauthorized.
- `ENOTFOUND` — `not found`, `unknown ref`, `no such`, `does not exist`.
- `ECONNECTION` — `connection reset`, `timed out`, other network failures.
- `EPROTOCOL` — `protocol error`, malformed pkt-line, protocol mismatches.
- `EUNSUPPORTED` — `shallow update not allowed` or unsupported shallow push.
- `EINTERNAL` — fallback when no known pattern matches.

Truth fixtures and golden tests validate this mapping:
- JSON truth: `__tests__/__truth__/push-errors.json`
- Tests: `__tests__/golden.compat.push.errors.truth.json.jasmine.js` and `__tests__/golden.compat.push.errors.more.jasmine.js`

## New APIs — libgit2 Parity

The 2.0.0-alpha release adds **100+ new exported functions and classes** to achieve near-complete parity with libgit2. These are available immediately without the `LIBGIT2_COMPAT` flag — they are standard API additions.

### Repository Introspection
- `repositoryState({ fs, dir })` — Returns current repo state: `'NONE'`, `'MERGE'`, `'REBASE_INTERACTIVE'`, `'REBASE_MERGE'`, `'REBASE'`, `'APPLY_MAILBOX'`, `'APPLY_MAILBOX_OR_REBASE'`, `'CHERRY_PICK'`, `'REVERT'`, `'BISECT'`
- `repositoryStateCleanup({ fs, dir })` — Clean up in-progress state files
- `isBare({ fs, dir })`, `isEmpty({ fs, dir })`, `isShallow({ fs, dir })`, `isHeadDetached({ fs, dir })`, `isHeadUnborn({ fs, dir })`

### Index Conflicts
- `indexHasConflicts({ fs, dir })` — Check if index has unresolved conflicts
- `indexConflictGet({ fs, dir, filepath })` — Get conflict entries (ancestor, ours, theirs)
- `indexConflictAdd/Remove/Iterator/Cleanup` — Full conflict management

### Diff & Patch
- `diffTreeToIndex`, `diffIndexToIndex`, `diffBlobs`, `diffPatchId` — Extended diff operations
- `emailCreateFromCommit({ fs, dir, oid })` — RFC 2822 mbox-format patch generation

### Merge Analysis
- `mergeAnalysis({ fs, dir, theirs })` — Returns `MERGE_ANALYSIS` flags (NORMAL, UP_TO_DATE, FASTFORWARD, UNBORN) and `MERGE_PREFERENCE`

### Content Filters
- `applyFilter({ fs, dir, filepath, mode })` — Apply smudge/clean filter
- `filterList({ fs, dir, filepath })` — List applicable filters for a path

### Configurable Revision Walking
- `revwalk({ fs, dir, include, exclude, sort, firstParentOnly, count, map })` — Full revwalk with `SORT.TOPOLOGICAL`, `SORT.TIME`, `SORT.REVERSE`

### Branch Extended
- `branchUpstream`, `setBranchUpstream`, `unsetBranchUpstream` — Tracking branch management
- `branchNameIsValid`, `branchIsHead` — Validation and checks

### Config Extended
- `deleteConfigSection`, `listConfigSubsections`, `deleteConfig`, `appendConfig`

### Commit Extended
- `commitNthAncestor`, `commitParent`, `commitHeaderField`

### Remote Extended
- `renameRemote`, `setRemoteUrl`, `setRemotePushUrl`, `remoteDefaultBranch`

### Refs Extended
- `foreachRef({ fs, dir, glob, callback })` — Iterate over refs
- `refNameIsValid(name)`, `symbolicRefTarget({ fs, dir, ref })`

### Graph Analysis
- `graphAheadBehind({ fs, dir, local, upstream })` — Ahead/behind counts
- `graphDescendantOf({ fs, dir, oid, ancestor })` — Ancestry check

### Gitattributes
- `getAttr`, `getAttrMany`, `getAttrAll` — Attribute resolution from `.gitattributes`

### Submodule Lifecycle
- `submoduleList`, `submoduleStatus`, `submoduleInit`, `submoduleDeinit`, `submoduleSync`, `submoduleAdd`

### Shallow & Sparse
- `listShallowRoots`, `unshallow` — Shallow repository management
- `sparseCheckoutInit`, `sparseCheckoutSet`, `sparseCheckoutAdd`, `sparseCheckoutList`

### Tree Operations
- `buildTree`, `walkTree`, `treeEntryByPath`

### Signature API
- `signatureFromBuffer`, `signatureCreate`, `signatureDefault`

### Ignore Extended
- `ignoreAddRule`, `ignoreClearRules`, `ignorePathIsIgnored` — Runtime ignore rules

### Reflog Management
- `deleteReflog`, `dropReflogEntry`, `renameReflog`

### Atomic Transactions
- `refTransaction({ fs, dir, updates })` — Atomic multi-ref updates

### Pathspec Matching
- `Pathspec` class, `pathspecNew`, `pathspecMatchesPath` — Glob patterns with negation

### Blob Extended
- `blobIsBinary`, `blobSize`, `blobCreateFromWorkdir`

### Tag Extended
- `tagForeach`, `tagPeel`, `tagTarget`, `tagCreateFromBuffer`

### Notes Extended
- `noteForeach`, `noteRead`, `noteCreate`, `noteRemove`

### Refspec Operations
- `refspecParse`, `refspecTransform`, `refspecSrcMatches`

### Pack Builder & Indexer
- `PackBuilder` class + `packBuilderNew` — Incremental pack construction
- `Indexer` class + `indexerNew` — Streaming packfile indexer

### Mailmap
- `Mailmap` class + `mailmapFromRepository` + `mailmapResolve` — Author identity mapping

### Custom ODB Backends
- `odbAddBackend`, `odbClearBackends`, `odbListBackends`, `odbRead`, `odbWrite`, `odbExists`

## Migration Checklist

- Test in staging — libgit2-compat behavior is now on by default, no flag needed.
- Review any code that relied on parsing raw push error messages; prefer branching on `update.code`.
- If you surface progress, expect phases `negotiation`, `receiving`, `indexing`, `resolving` during fetch.
- If you consume `getRemoteInfo2`, account for JSON-safe ref objects and explicit `protocolVersion`.
- Update tests to accept normalized shapes (e.g., optional fetch result fields) if you asserted strict object equality.

## Testing and CI

- Golden tests exercise compat semantics end-to-end:
  - Entry: `__tests__/golden.index.webpack.js` (includes remote-info, fetch, fetch matrix, push, push error taxonomy, and truth fixtures).
  - Runner: Karma + ChromeHeadless with Webpack 4.
- Node 17+ requires `NODE_OPTIONS=--openssl-legacy-provider` when bundling tests.
- CI workflow: `.github/workflows/compat-tests.yml` runs compat-only and golden suites.

## SSH Transport (New in 2.0.0-alpha)

SSH URLs (`ssh://user@host/path` and `git@host:path`) are now natively supported for `clone`, `fetch`, `push`, and `getRemoteInfo`.

### Setup
```bash
npm install ssh2
```

`ssh2` is an **optional peer dependency** — only required if you use SSH URLs. HTTP/HTTPS remotes work without it.

### Authentication

The same `onAuth` callback pattern used for HTTP works for SSH:

```js
// Private key auth
await git.clone({
  fs, dir, http,
  url: 'git@github.com:user/repo.git',
  onAuth: () => ({
    privateKey: fs.readFileSync('/path/to/id_ed25519', 'utf8'),
    passphrase: 'optional',  // only if key is encrypted
  })
})

// Password/token auth
await git.fetch({
  fs, dir, http,
  url: 'ssh://git@example.com/repo.git',
  onAuth: () => ({ username: 'git', password: 'token' })
})

// SSH agent (auto-detected from SSH_AUTH_SOCK if no explicit auth)
await git.push({ fs, dir, http })  // uses SSH agent automatically
```

### Internals
- `GitRemoteSSH` class in `src/managers/GitRemoteSSH.js` — same interface as `GitRemoteHTTP`
- Registered automatically in `GitRemoteManager` for `ssh` transport
- Reuses existing wire protocol handlers (pkt-line, pack format)

## SOCKS Proxy Support (New in 2.0.0-alpha)

All network operations (`clone`, `fetch`, `push`, `pull`, `getRemoteInfo`, `getRemoteInfo2`) now accept a `proxy` parameter for routing traffic through a SOCKS4/5 proxy.

### Setup
```bash
npm install socks-proxy-agent
```

### Usage
```js
// Pass a SOCKS proxy URL string
await git.clone({
  fs, http, dir: '/repo',
  url: 'https://github.com/user/repo.git',
  proxy: 'socks5://localhost:1080',
})

// Or with authentication
await git.fetch({
  fs, http, dir: '/repo',
  proxy: 'socks5://user:pass@proxy.example.com:1080',
})

// Or pass a pre-built agent
import { createProxyAgent } from 'dimorphic-git'
const agent = await createProxyAgent('socks5://localhost:1080')
await git.push({ fs, http, dir: '/repo', proxy: agent })
```

The `proxy` parameter accepts:
- A **string** — SOCKS proxy URL (`socks4://`, `socks4a://`, `socks5://`, `socks5h://`)
- An **object** — any `http.Agent` instance (passed through as-is)

## Known Limitations / Notes

- Error mapping is heuristic by design; additional phrases may be added as new truth fixtures are gathered.
- No native modules or WASM are introduced; this is a JS-only change (ssh2 is also pure JS).
- Public API remains stable; internal shapes may carry extra optional fields from transports.
- SSH transport is Node.js-only (ssh2 requires Node APIs). Browser environments should continue using HTTP/HTTPS.

## Timeline for Flag Promotion

- ~~Phase 1: Compat behind `LIBGIT2_COMPAT`~~ ✅ Done
- ~~Phase 2: Dogfood compat as default in CI~~ ✅ Done
- **Phase 3: Compat is the default** ✅ **Current** — `ISOGIT_LEGACY=1` opts out
- Phase 4 (future): Remove legacy code paths entirely

We will announce timelines in release notes and keep the flag available for at least one minor release after defaulting.

## Frequently Asked Questions

- Can I keep using the old behavior?
  - Yes, while the flag exists. After compat becomes default, the opt-out flag will be available for at least one minor release.
- Do I need to change my code?
  - Most consumers should not. If you matched on raw push error strings, switch to checking `update.code`.
- Is there any performance impact?
  - The compat layer focuses on semantics; no material perf regressions are expected. Please report regressions with repros.

---

For deeper details and examples, see `docs/compat/README.md` and the tests under `__tests__/`.
