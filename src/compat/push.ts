// JS-only push semantics aligning error reporting and refspec handling with libgit2 behavior.

import type { CompatAPI, PushOptions } from './backend'
import { err } from './errors'

export interface PushTransport {
  upload(opts: {
    url: string
    refspecs: string[]
    force?: boolean
    onProgress?: (p: { writtenObjects: number; totalObjects?: number }) => void
  }): Promise<{ updates: Array<{ ref: string; ok: boolean; message?: string }>; rejected: string[] }>
}

export function createPushCompat(transport: PushTransport): Pick<CompatAPI, 'push'> {
  async function push(opts: PushOptions) {
    const res = await transport.upload({
      url: opts.url,
      refspecs: opts.refspecs,
      force: opts.force,
      onProgress: p => opts.onProgress?.({ writtenObjects: p.writtenObjects, totalObjects: p.totalObjects }),
    })

    return res
  }
  return { push }
}
