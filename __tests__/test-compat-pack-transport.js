/* eslint-env jest */

import { packTransport } from '../src/compat/adapters/pack-transport.js'

describe('compat pack-transport (stub)', () => {
  it('negotiate returns empty updatedRefs', async () => {
    const res = await packTransport.negotiate({})
    expect(res).toEqual({ updatedRefs: [] })
  })

  it('negotiate accepts any options', async () => {
    const res = await packTransport.negotiate({ url: 'https://example.com', depth: 1 })
    expect(res).toEqual({ updatedRefs: [] })
  })
})
