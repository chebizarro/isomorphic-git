/* eslint-env jest */

import { LIBGIT2_COMPAT } from '../src/compat/flag.js'

describe('compat flag import', () => {
  it('exports LIBGIT2_COMPAT as a boolean', () => {
    expect(typeof LIBGIT2_COMPAT).toBe('boolean')
  })

  it('is false by default in test environment', () => {
    // Unless LIBGIT2_COMPAT env var is set, should be false
    if (!process.env.LIBGIT2_COMPAT || !['true', '1', 'yes', 'on'].includes(process.env.LIBGIT2_COMPAT.toLowerCase())) {
      expect(LIBGIT2_COMPAT).toBe(false)
    }
  })
})
