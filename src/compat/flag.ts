export const LIBGIT2_COMPAT =
  (typeof process !== 'undefined' && (process as any).env && (process as any).env.LIBGIT2_COMPAT === 'true') ||
  (typeof globalThis !== 'undefined' && (globalThis as any).__LIBGIT2_COMPAT__ === true)
