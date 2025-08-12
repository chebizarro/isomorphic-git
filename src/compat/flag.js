export const LIBGIT2_COMPAT =
  (typeof process !== 'undefined' && process && process.env && process.env.LIBGIT2_COMPAT === 'true') ||
  (typeof globalThis !== 'undefined' && globalThis && globalThis.__LIBGIT2_COMPAT__ === true)
