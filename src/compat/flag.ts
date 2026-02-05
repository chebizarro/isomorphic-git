export const LIBGIT2_COMPAT =
  (typeof process !== 'undefined' &&
    (process as any).env &&
    ['true', '1', 'yes', 'on'].includes(
      String((process as any).env.LIBGIT2_COMPAT).toLowerCase()
    )) ||
  (typeof globalThis !== 'undefined' && (globalThis as any).__LIBGIT2_COMPAT__ === true)
