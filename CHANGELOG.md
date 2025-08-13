# Changelog

All notable changes to this project will be documented in this file.

The format is based on Keep a Changelog, and this project adheres to Semantic Versioning.

## [2.0.0-alpha]

### Added
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

### CI
- Compat golden suites run under Karma + ChromeHeadless, Webpack 4, with `NODE_OPTIONS=--openssl-legacy-provider`.
- Workflow: `.github/workflows/compat-tests.yml` executes compat-only and golden suites.

### Notes
- The compat layer preserves the public API; behavior aligns with libgit2 where feasible, without native modules or WASM.
- Error taxonomy codes: `ENONFASTFORWARD`, `EPERM` (incl. protected branch), `ECONFLICT`, `EAUTH`, `ENOTFOUND`, `ECONNECTION`, `EPROTOCOL`, `EUNSUPPORTED`, `EINTERNAL`.

### Migration
- See `UPGRADING.md` for the feature flag, behavior changes, migration checklist, and rollout plan.

[2.0.0-alpha]: https://github.com/isomorphic-git/isomorphic-git/releases/tag/v2.0.0-alpha
