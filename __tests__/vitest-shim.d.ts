declare module 'vitest' {
  // Minimal shim to satisfy type checking for legacy Vitest tests
  export const describe: any
  export const it: any
  export const test: any
  export const expect: any
  export const beforeAll: any
  export const beforeEach: any
  export const afterAll: any
  export const afterEach: any
  export const vi: any
}
