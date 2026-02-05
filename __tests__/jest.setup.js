/* eslint-env node */

import { randomUUID } from 'crypto'

if (!global.crypto) global.crypto = {}

if (!global.crypto.randomUUID) {
  global.crypto.randomUUID = randomUUID
}
