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

- The new behavior is implemented under `src/compat/` and can be toggled with the environment flag `LIBGIT2_COMPAT`.
- Public API is preserved; the compat layer adapts internal behavior and result shapes to match libgit2 semantics.
- Entry points affected when flag is enabled:
  - `getRemoteInfo2` → `src/compat/remote-info.js`
  - `fetch` → `src/compat/fetch.js` (via compat transport/adapters)
  - `push` → `src/compat/push.js` (via compat transport/adapters)

To run tests or your app with the compat layer:

```sh
LIBGIT2_COMPAT=1 node your-script.js
```

Karma/CI use this flag where appropriate in the golden suites.

## Behavioral Changes by Area

### Remote Discovery (`getRemoteInfo2`)
- Protocol detection returns literal protocol versions: `1` or `2` via a `protocolVersion` field.
- v2: `{ protocolVersion: 2, capabilities }`.
- v1: `{ protocolVersion: 1, capabilities, refs }` where refs are JSON-safe objects with fields:
  - `ref` (name), `oid`, `target` (symref target if any), `peeled` (peeled tag OID if any).
- `HEAD` symref precedence and peeled tag mapping mirror libgit2’s rules.

### Fetch
- Options forwarded: `depth`, `since`, `singleBranch`, `tags`, `prune`, `pruneTags`, `relative`, `exclude`.
- Normalization: `undefined` values for `depth`/`since` are passed as `null` to maintain legacy compatibility.
- Progress phases are standardized as strings and emitted in order:
  - `negotiation` → `receiving` → `indexing`.
- Result can include additional optional fields exposed by transports: `defaultBranch`, `fetchHead`, `fetchHeadDescription`, `headers`, `pruned`.

### Push
- Result is normalized to:
  - `updates`: Array of `{ ref, ok, message?, code? }` where `code` is a normalized error code when `ok === false`.
  - `rejected`: Array of `ref` names rejected by the remote.
- Progress events are forwarded unchanged.

## Standardized Push Error Taxonomy

Push failures are mapped heuristically to stable codes for easier handling and parity with libgit2-like behavior. Implemented in:
- `src/compat/errors.ts` (runtime, TS) and `src/compat/errors.js` (JS shim used in tests/build).
- Codes are attached in compat push adapters (`src/compat/adapters/push-transport.js`) and enforced in `src/compat/push.js`.

Codes and common triggers:

- `ENONFASTFORWARD` — messages containing `non-fast-forward`, `fetch first`.
- `EPERM` — `hook declined`, `pre-receive hook declined`, `protected branch`.
- `ECONFLICT` — `cannot lock ref`, `lock … exists`, ref lock conflicts.
- `EAUTH` — `Authentication failed`, credential denied/unauthorized.
- `ENOTFOUND` — `not found`, `unknown ref`, `no such`.
- `ECONNECTION` — `connection reset`, `timed out`, other network failures.
- `EPROTOCOL` — `protocol error`, malformed pkt-line, protocol mismatches.
- `EUNSUPPORTED` — `shallow update not allowed` or unsupported shallow push.
- `EINTERNAL` — fallback when no known pattern matches.

Truth fixtures and golden tests validate this mapping:
- JSON truth: `__tests__/__truth__/push-errors.json`
- Tests: `__tests__/golden.compat.push.errors.truth.json.jasmine.js` and `__tests__/golden.compat.push.errors.more.jasmine.js`

## Migration Checklist

- Enable `LIBGIT2_COMPAT` in staging to validate behavior in your environment.
- Review any code that relied on parsing raw push error messages; prefer branching on `update.code`.
- If you surface progress, expect phases `negotiation`, `receiving`, `indexing` during fetch.
- If you consume `getRemoteInfo2`, account for JSON-safe ref objects and explicit `protocolVersion`.
- Update tests to accept normalized shapes (e.g., optional fetch result fields) if you asserted strict object equality.

## Testing and CI

- Golden tests exercise compat semantics end-to-end:
  - Entry: `__tests__/golden.index.webpack.js` (includes remote-info, fetch, fetch matrix, push, push error taxonomy, and truth fixtures).
  - Runner: Karma + ChromeHeadless with Webpack 4.
- Node 17+ requires `NODE_OPTIONS=--openssl-legacy-provider` when bundling tests.
- CI workflow: `.github/workflows/compat-tests.yml` runs compat-only and golden suites.

## Known Limitations / Notes

- Error mapping is heuristic by design; additional phrases may be added as new truth fixtures are gathered.
- No native modules or WASM are introduced; this is a JS-only change.
- Public API remains stable; internal shapes may carry extra optional fields from transports.

## Timeline for Flag Promotion

- Phase 1: Compat behind `LIBGIT2_COMPAT` (current).
- Phase 2: Dogfood compat as default in CI; keep flag to disable.
- Phase 3: Make compat default behavior; deprecate the flag.

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
