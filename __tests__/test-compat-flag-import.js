/* eslint-env jest */

import { LIBGIT2_COMPAT } from '../src/compat/flag.js'

describe('compat flag import', () => {
  it('exports LIBGIT2_COMPAT as a boolean', () => {
    expect(typeof LIBGIT2_COMPAT).toBe('boolean')
  })

  it('is true by default (compat is the default behavior)', () => {
    // LIBGIT2_COMPAT should be true unless ISOGIT_LEGACY or LIBGIT2_COMPAT=false/0/no/off is set
    const legacyVal = String(process.env.ISOGIT_LEGACY ?? '').toLowerCase()
    const compatVal = String(process.env.LIBGIT2_COMPAT ?? '').toLowerCase()
    const isLegacy =
      ['true', '1', 'yes', 'on'].includes(legacyVal) ||
      ['false', '0', 'no', 'off'].includes(compatVal)
    if (!isLegacy) {
      expect(LIBGIT2_COMPAT).toBe(true)
    }
  })
})
