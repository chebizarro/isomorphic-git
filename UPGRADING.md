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
