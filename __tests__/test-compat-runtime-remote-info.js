/* eslint-env jest */

import { createRemoteInfoCompat } from '../src/compat/runtime-remote-info.js'

describe('compat runtime-remote-info re-export', () => {
  it('exports createRemoteInfoCompat', () => {
    expect(typeof createRemoteInfoCompat).toBe('function')
  })

  it('works end-to-end via re-export', async () => {
    const transport = {
      async discover() {
        return {
          protocol: 'v1',
          capabilities: ['agent=git/2.44.0'],
          refs: [
            { name: 'refs/heads/main', oid: 'a'.repeat(40) },
          ],
        }
      },
    }
    const { getRemoteInfo2 } = createRemoteInfoCompat(transport)
    const info = await getRemoteInfo2('https://example.com/repo.git')
    expect(info.protocol).toBe('v1')
    expect(info.refs.length).toBe(1)
  })
})
