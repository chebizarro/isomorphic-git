// Ambient declarations for compat modules used in JS-based Jasmine tests

declare module '../src/compat/remote-info.js' {
  export function createRemoteInfoCompat(transport: any): {
    getRemoteInfo2(
      url: string,
      opts?: any
    ): Promise<{
      protocol: 'v1' | 'v2'
      capabilities: Record<string, string | true>
      refs: Array<{
        name: string
        oid: string
        peeled?: string | null
        symbolic?: string | null
        annotated?: boolean
        target?: string | null
      }>
      head?: { symbolic?: string | null; oid?: string | null }
    }>
  }
}

declare module '../src/compat/fetch.js' {
  export function createFetchCompat(transport: any): {
    fetch(opts: any): Promise<{
      defaultBranch?: string
      fetchHead?: string
      fetchHeadDescription?: string
      headers?: Record<string, string>
      pruned: string[]
      updatedRefs?: string[]
    }>
  }
}

// Allow requiring JSON fixtures in tests
declare module '*.json' {
  const value: any
  export default value
}
