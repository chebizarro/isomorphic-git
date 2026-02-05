# Upstream Integration Summary

**Date**: February 5, 2026  
**Base Commit**: a8551a8c (upstream v1.32.3)  
**Current Upstream**: f87ef9a1 (upstream v1.36.3)  
**Integration Status**: Partial (3 of 19 commits)

## Overview

This document tracks the integration of upstream isomorphic-git changes into the v2.0.0-alpha fork with libgit2 compatibility layer.

## Integrated Changes ✅

### 1. Detached HEAD Fix (f87ef9a1)
- **Commit**: `05bf2a04` (cherry-picked from upstream f87ef9a1)
- **Issue**: #2276
- **Impact**: Fixes `commit` command to properly update detached HEAD
- **Files Modified**: `src/commands/commit.js`, `__tests__/test-commit.js`
- **Compatibility**: ✅ No conflicts with compat layer
- **Tests**: ✅ All 45 tests passing

### 2. Ref Name Validation Fix (ea52fe17)
- **Commit**: `8fa05bc6` (cherry-picked from upstream ea52fe17)
- **Issue**: #2206
- **Impact**: Fixes incorrect rejection of valid ref names
- **Files Modified**: `src/utils/isValidRef.js`, tests
- **Compatibility**: ✅ No conflicts with compat layer
- **Tests**: ✅ All 45 tests passing

### 3. Security: sha.js Update (4ede00f7)
- **Commit**: `96a416f1` (cherry-picked from upstream 4ede00f7)
- **Issue**: #2190
- **Impact**: Updates sha.js dependency for security fixes
- **Files Modified**: `package.json`, `package-lock.json`
- **Compatibility**: ✅ No conflicts with compat layer
- **Tests**: ✅ All 45 tests passing

## Deferred Changes 🔄

### High Priority (Conflicts)

#### Symlink Handling Fix (667be272)
- **Issue**: #2271
- **Reason for Deferral**: Merge conflicts in submodule-related test files
- **Conflicts**: 
  - `.all-contributorsrc`
  - `README.md`
  - `__tests__/__helpers__/FixtureFS/makeNodeFixture.js`
  - `__tests__/__helpers__/FixtureFSSubmodule.js` (deleted in fork)
  - `__tests__/test-walk-in-submodule.js` (deleted in fork)
  - `__tests__/test-walk.js`
- **Recommendation**: Manual merge after submodule support evaluation
- **Core Change**: `src/models/GitWalkerFs.js` - symlink content handling

### Major Infrastructure (Requires Extensive Testing)

#### BrowserFS → ZenFS Migration (2e3274dd)
- **Issue**: #1996
- **Reason for Deferral**: Major infrastructure change requiring extensive testing
- **Benefits**:
  - Fixes OpenSSL error with webpack 4 (upgrades to webpack 5)
  - Modernizes filesystem abstraction layer
  - Updates Node.js requirement to v18+
- **Impact**:
  - 353 files changed (+39,538 -56,275 lines)
  - Webpack 4 → 5
  - Babel config updates
  - Many dependency updates
- **Recommendation**: Separate integration effort after v2.0.0-alpha stabilization
- **Risk**: High - could introduce regressions in compat layer

### Feature Additions (Not Critical for v2.0.0-alpha)

#### Submodule Support (8e331ccc)
- **Issue**: #2090
- **Reason for Deferral**: Feature addition, not a bug fix
- **Impact**: Adds git submodule command support
- **Recommendation**: Evaluate for v2.1.0 after core v2.0.0 release

#### Stash API Improvements (c312c882, 555d7db7)
- **Issues**: #2211, #2138, #2207
- **Reason for Deferral**: Feature additions/improvements
- **Impact**: Adds stash create operation, fixes stash push/pop
- **Recommendation**: Consider for v2.1.0

#### Expose Managers + Models (adfee074)
- **Issue**: #2139
- **Reason for Deferral**: API expansion, not critical
- **Impact**: Exposes internal managers and models for advanced use cases
- **Recommendation**: Evaluate for v2.1.0

### Low Priority (Documentation/Chores)

- **54687304**: Fix grammar in README
- **253f812f**: Submodule instructions
- **93d3ef99**: Update README
- **dd54d92a**: FileSystem.js cp command special-case
- **24f7cc9c**: Fix readTree error
- **49555a27**: Fix legacy SSL dependencies
- **f16dd491**: Build test improvements
- **ee6c7f5f**: Improve fatal error message
- **1e8e6509**: Fix header name in docs
- **ef2347a3**: Force use micro@9.3.4

## Compatibility Assessment

### Compat Layer Isolation ✅
The libgit2 compatibility layer is well-isolated in `src/compat/` and does not conflict with upstream changes. All integrated bug fixes work correctly with the compat layer.

### Core File Changes
Upstream changes to core files that the compat layer wraps:
- `src/commands/push.js` - Only 2 lines changed (low impact)
- `src/managers/GitRemoteHTTP.js` - Changes in ZenFS migration
- `src/managers/GitRemoteManager.js` - Changes in ZenFS migration

### Test Results
- **Before Integration**: 40/40 tests passing
- **After User Enhancements**: 45/45 tests passing
- **After Upstream Integration**: 45/45 tests passing ✅

## Recommendations

### Immediate (v2.0.0-alpha)
1. ✅ **DONE**: Integrate critical bug fixes (detached HEAD, ref validation, sha.js)
2. ✅ **DONE**: Verify compat layer compatibility
3. 📝 **TODO**: Document integration decisions (this file)

### Short-term (v2.0.0 release)
1. Manually merge symlink handling fix (667be272) after resolving conflicts
2. Consider cherry-picking low-priority documentation fixes
3. Evaluate FileSystem.js cp command fix (dd54d92a)

### Medium-term (v2.1.0)
1. Evaluate BrowserFS → ZenFS migration
   - Requires comprehensive testing
   - Would fix webpack/OpenSSL issues permanently
   - Consider as separate major effort
2. Evaluate submodule support integration
3. Consider stash API improvements
4. Evaluate exposing managers/models API

### Long-term
- Establish regular upstream sync cadence
- Monitor upstream for security fixes
- Track breaking changes in upstream

## Integration Strategy

### Cherry-pick Approach ✅
- **Pros**: Selective integration, minimal risk, maintains v2.0.0 stability
- **Cons**: Manual tracking, potential for drift from upstream
- **Status**: Working well for bug fixes

### Merge Approach (Future)
- **Pros**: Automatic tracking, easier to stay current
- **Cons**: Higher risk of conflicts, harder to control what's integrated
- **Recommendation**: Consider after v2.0.0 stabilization

## Notes

- The v2.0.0-alpha branch represents a major version bump with breaking changes
- The compat layer is designed to be isolated and should not conflict with most upstream changes
- BrowserFS → ZenFS migration is the most significant upstream change and should be carefully evaluated
- All integrated changes have been tested and verified to work with the compat layer

## Upstream Tracking

To check for new upstream changes:
```bash
git fetch upstream
git log --oneline main..upstream/main
```

To see changes in specific files:
```bash
git log --oneline main..upstream/main -- src/compat/
```
