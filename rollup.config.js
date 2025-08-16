import fs from 'fs'
import path from 'path'

import pkg from './package.json'

const external = [
  'fs',
  'path',
  'crypto',
  'stream',
  'crc/lib/crc32.js',
  'sha.js/sha1',
  'sha.js/sha1.js',
  ...Object.keys(pkg.dependencies),
]

// Modern modules
const ecmaConfig = (input, output) => ({
  input: `src/${input}`,
  external: [...external],
  output: [
    {
      format: 'es',
      file: `${output}`,
    },
  ],
})

// Legacy CommonJS2 modules
const nodeConfig = (input, output) => ({
  input: `src/${input}`,
  external: [...external],
  output: [
    {
      format: 'cjs',
      file: `${output}`,
      exports: 'named',
    },
  ],
})

// Script tags that "export" a global var for those browser environments that
// still don't support `import` (Workers and ServiceWorkers)
const umdConfig = (input, output, name) => ({
  input: `src/${input}`,
  output: [
    {
      format: 'umd',
      file: `${output}`,
      name,
      exports: 'named',
    },
  ],
})

const template = umd =>
  JSON.stringify(
    {
      type: 'module',
      main: 'index.cjs',
      module: 'index.js',
      typings: 'index.d.ts',
      unpkg: umd ? 'index.umd.js' : undefined,
    },
    null,
    2
  )

const pkgify = (input, output, name) => {
  fs.mkdirSync(path.join(__dirname, output), { recursive: true })
  fs.writeFileSync(
    path.join(__dirname, output, 'package.json'),
    template(!!name)
  )
  return [
    ecmaConfig(`${input}/index.js`, `${output}/index.js`),
    nodeConfig(`${input}/index.js`, `${output}/index.cjs`),
    ...(name
      ? [umdConfig(`${input}/index.js`, `${output}/index.umd.js`, name)]
      : []),
  ]
}

export default [
  // Root ESM/CJS outputs into dist/
  ecmaConfig('index.js', 'dist/esm/index.js'),
  nodeConfig('index.js', 'dist/cjs/index.cjs'),

  // Keep legacy internal artifacts (not exported)
  ecmaConfig('internal-apis.js', 'internal-apis.js'),
  nodeConfig('internal-apis.js', 'internal-apis.cjs'),

  // Keep legacy subpath packages for http/node (unchanged paths)
  ...pkgify('http/node', 'http/node'),

  // New ESM entry for http/web at dist/esm/http/web.js as required by exports
  ecmaConfig('http/web/index.js', 'dist/esm/http/web.js'),
]
