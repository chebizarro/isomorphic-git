# libgit2-compat Semantics (JS-only)

This document captures the target semantics mirrored from libgit2, the rationale, and where the code enforces them.

- Remote Discovery: protocol v2 capability parsing, HEAD symref precedence, peeled tags.
- Fetch: wants/haves negotiation ordering; shallow/deepen mapping; progress event phases.
- Push: refspec normalization; non-FF handling; remote status aggregation.

All implementations live under `src/compat/`. **libgit2-compatible behavior is the default** as of 2.0.0-alpha.

## Feature flag

The libgit2-compatible behavior is **on by default**. To opt out and use legacy (pre-2.0) behavior:

- **Node.js**: Set `ISOGIT_LEGACY=1` (or `ISOGIT_LEGACY=true/yes/on`)
- **Backward compat**: `LIBGIT2_COMPAT=false` (or `0/no/off`) also disables compat for continuity with pre-promotion scripts
- **Browser**: Set `globalThis.__ISOGIT_LEGACY__ = true` before importing

```sh
# Opt out (Node)
ISOGIT_LEGACY=1 node your-script.js

# Backward-compat opt out
LIBGIT2_COMPAT=false node your-script.js
```

- Discovery entry: `src/api/getRemoteInfo2.js` routes via `createRemoteInfoCompat()` (always active now).
- Fetch/Push entries: factories and adapters under `src/compat/` wrap legacy commands and adapt shapes.

## Remote Discovery

- Protocol literal types: `'v1' | 'v2'` in `src/compat/adapters/http-transport.js`.
- v2 returns `{ protocolVersion: 2, capabilities }`.
- v1 returns `{ protocolVersion: 1, capabilities, refs }` with JSON-safe refs:
  - `ref` (name), `oid`, `symbolic` (symref target refname if any), `peeled` (peeled tag OID if any).
- HEAD symref precedence and peeled tag mapping align with libgit2.
- In protocol v2, the capability `symref=HEAD:refs/heads/<name>` is parsed (when present) into `head.symbolic`. Compat does not guess a default branch without explicit symref information.

## Fetch Semantics

- Supported options forwarded to legacy `_fetch`: `depth`, `since`, `singleBranch`, `tags`, `prune`, `pruneTags`, `relative`, `exclude`.
- Validation (compat-only, libgit2-like):
  - `depth` must be `null`/`undefined` or a finite number `>= 0`.
  - `since` must be `null`/`undefined` or a `Date`.
  - `depth` and `since` are mutually exclusive (passing both throws `EINVALIDSPEC`).
- Normalization: `depth`/`since` map `undefined` → `null` for legacy command compatibility.
- Progress phases (canonical strings) emitted by compat layer and expected by tests:
  - `negotiation` → `receiving` → `indexing` → `resolving`.
  - Ordering is enforced; if the underlying implementation skips earlier phases, compat may emit missing phases once as placeholder events.
- Result shape may include extended fields to match transports: `defaultBranch`, `fetchHead`, `fetchHeadDescription`, `headers`, `pruned`.

## Push Semantics

- Compat result shape is normalized to:
  - `updates`: Array of `{ ref, ok, message?, code? }`.
  - `rejected`: Array of `ref` names rejected by server.
- Per-ref rejections (remote `ng` statuses / report-status failures) are returned in `updates` and do not throw in compat mode.
- Only protocol/transport/unpack failures throw (eg network failures, authentication failures, malformed protocol responses, or remote unpack failure).
- Progress events are forwarded unchanged from the underlying implementation.

## Error Taxonomy Mapping (Push)

Compat maps legacy message substrings to normalized codes, for testability and libgit2-like behavior. Mapping implemented in:
- `src/compat/errors.ts` (TS) and `src/compat/errors.js` (JS shim).
- Adapters attach codes in `src/compat/adapters/push-transport.js` and enforced in `src/compat/push.js`.

Error codes and example triggers:

- `ENONFASTFORWARD` — messages containing `non-fast-forward`, `fetch first`.
- `EINVALIDSPEC` — `invalid refspec`, `does not match any`, `not a valid reference`.
- `EUNBORN` — `unborn`, `does not have any commits yet`.
- `ESHORTREAD` — `short read`, `unexpected EOF`, `premature end of pack file`.
- `EPERM` — `hook declined`, `pre-receive hook declined`, `protected branch`.
- `ECONFLICT` — `cannot lock ref`, `lock ... exists`, ref lock conflicts.
- `EAUTH` — `Authentication failed` or credential/denied phrases.
- `ENOTFOUND` — `not found`, `unknown ref`, `no such`, `does not exist`.
- `ECONNECTION` — `connection reset`, `timed out`, network-level failures.
- `EPROTOCOL` — `protocol error`, malformed pkt-line/protocol mismatches.
- `EUNSUPPORTED` — `shallow update not allowed` or unsupported shallow push.
- `EINTERNAL` — fallback when no known pattern matches.

This taxonomy is validated by golden tests under `__tests__/`, including JSON truth fixtures at `__tests__/__truth__/push-errors.json`. We will continue expanding fixtures gathered from git CLI/libgit2 outputs.
