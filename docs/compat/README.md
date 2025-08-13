# libgit2-compat Semantics (JS-only)

This document captures the target semantics mirrored from libgit2, the rationale, and where the code enforces them.

- Remote Discovery: protocol v2 capability parsing, HEAD symref precedence, peeled tags.
- Fetch: wants/haves negotiation ordering; shallow/deepen mapping; progress event phases.
- Push: refspec normalization; non-FF handling; remote status aggregation.

All implementations live under `src/compat/` and are wired via a temporary feature flag until promoted to default.

## Feature flag

- `LIBGIT2_COMPAT` toggles the compat runtime paths.
- Discovery entry: `src/api/getRemoteInfo2.js` routes via `createRemoteInfoCompat()` when the flag is enabled.
- Fetch/Push entries: factories and adapters under `src/compat/` wrap legacy commands and adapt shapes.

## Remote Discovery

- Protocol literal types: `'v1' | 'v2'` in `src/compat/adapters/http-transport.js`.
- v2 returns `{ protocolVersion: 2, capabilities }`.
- v1 returns `{ protocolVersion: 1, capabilities, refs }` with JSON-safe refs:
  - `ref` (name), `oid`, `target` (symref if any), `peeled` (peeled tag OID if any).
- HEAD symref precedence and peeled tag mapping align with libgit2.

## Fetch Semantics

- Supported options forwarded to legacy `_fetch`: `depth`, `since`, `singleBranch`, `tags`, `prune`, `pruneTags`, `relative`, `exclude`.
- Normalization: `depth`/`since` map `undefined` → `null` for legacy command compatibility.
- Progress phases (strings) emitted by compat layer and expected by tests:
  - `negotiation` → `receiving` → `indexing`.
- Result shape may include extended fields to match transports: `defaultBranch`, `fetchHead`, `fetchHeadDescription`, `headers`, `pruned`.

## Push Semantics

- Compat result shape is normalized to:
  - `updates`: Array of `{ ref, ok, message?, code? }`.
  - `rejected`: Array of `ref` names rejected by server.
- Progress events are forwarded unchanged from the underlying implementation.

## Error Taxonomy Mapping (Push)

Compat maps legacy message substrings to normalized codes, for testability and libgit2-like behavior. Mapping implemented in:
- `src/compat/errors.ts` (TS) and `src/compat/errors.js` (JS shim).
- Adapters attach codes in `src/compat/adapters/push-transport.js` and enforced in `src/compat/push.js`.

Error codes and example triggers:

- `ENONFASTFORWARD` — messages containing `non-fast-forward`, `fetch first`.
- `EPERM` — `hook declined`, `pre-receive hook declined`, `protected branch`.
- `ECONFLICT` — `cannot lock ref`, `lock ... exists`, ref lock conflicts.
- `EAUTH` — `Authentication failed` or credential/denied phrases.
- `ENOTFOUND` — `not found`, `unknown ref`, `no such`.
- `ECONNECTION` — `connection reset`, `timed out`, network-level failures.
- `EPROTOCOL` — `protocol error`, malformed pkt-line/protocol mismatches.
- `EUNSUPPORTED` — `shallow update not allowed` or unsupported shallow push.

This taxonomy is validated by golden tests under `__tests__/`, including JSON truth fixtures at `__tests__/__truth__/push-errors.json` exercised by `__tests__/golden.compat.push.errors.truth.json.jasmine.js`. We will continue expanding fixtures gathered from git CLI/libgit2 outputs.

## Tests and CI

- Golden entry: `__tests__/golden.index.webpack.js` includes remote-info, fetch (including matrix), push, and push-error tests.
- Karma + ChromeHeadless, Webpack 4. Requires `NODE_OPTIONS=--openssl-legacy-provider`.
- CI workflow: `.github/workflows/compat-tests.yml` runs compat-only and golden suites.
