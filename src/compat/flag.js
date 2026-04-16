/* global globalThis */

/**
 * Returns true if legacy (pre-2.0) behavior has been explicitly requested.
 *
 * Opt-out methods (any one of these disables the libgit2-compat layer):
 *   - ISOGIT_LEGACY=1|true|yes|on    (preferred — explicit opt-out)
 *   - LIBGIT2_COMPAT=false|0|no|off  (for backward compat with old flag)
 *   - globalThis.__ISOGIT_LEGACY__ = true  (browser / non-Node environments)
 */
function isLegacyMode() {
  if (typeof process !== 'undefined' && process && process.env) {
    // Preferred opt-out: ISOGIT_LEGACY=1
    const legacyVal = String(process.env.ISOGIT_LEGACY ?? '').toLowerCase()
    if (['true', '1', 'yes', 'on'].includes(legacyVal)) return true

    // Backward-compat opt-out: LIBGIT2_COMPAT=false / 0 / no / off
    const compatVal = String(process.env.LIBGIT2_COMPAT ?? '').toLowerCase()
    if (['false', '0', 'no', 'off'].includes(compatVal)) return true
  }

  // Browser / non-Node opt-out
  if (
    typeof globalThis !== 'undefined' &&
    globalThis &&
    globalThis.__ISOGIT_LEGACY__ === true
  ) {
    return true
  }

  return false
}

/**
 * True when the libgit2-compatible behavior is active (the default).
 * False only when legacy mode has been explicitly requested via
 * ISOGIT_LEGACY=1, LIBGIT2_COMPAT=false/0/no/off, or
 * globalThis.__ISOGIT_LEGACY__ = true.
 */
export const LIBGIT2_COMPAT = !isLegacyMode()
