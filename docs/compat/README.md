# libgit2-compat Semantics (JS-only)

This document captures the target semantics mirrored from libgit2, the rationale, and where the code enforces them.

- Remote Discovery: protocol v2 capability parsing, HEAD symref precedence, peeled tags.
- Fetch: wants/haves negotiation ordering; shallow/deepen mapping; progress event phases.
- Push: refspec normalization; non-FF handling; remote status aggregation.

All implementations live under `src/compat/` and are wired via a temporary feature flag until promoted to default.
