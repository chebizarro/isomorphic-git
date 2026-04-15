/* global globalThis */
export const LIBGIT2_COMPAT =
  (typeof process !== 'undefined' &&
    process &&
    process.env &&
    ['true', '1', 'yes', 'on'].includes(
      String(process.env.LIBGIT2_COMPAT).toLowerCase()
    )) ||
  (typeof globalThis !== 'undefined' &&
    globalThis &&
    globalThis.__LIBGIT2_COMPAT__ === true)
