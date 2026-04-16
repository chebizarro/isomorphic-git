<p align="center">
  <img src="https://raw.githubusercontent.com/dimorphic-git/dimorphic-git/main/website/static/img/dimorphic-git-logo.svg?sanitize=true" alt="" height="150"/>
</p>

# dimorphic-git

`dimorphic-git` is a pure JavaScript reimplementation of git that works in both Node.js and browser JavaScript environments. It can read and write to git repositories, fetch from and push to git remotes (such as GitHub), all without any native C++ module dependencies.

The name is a deliberate fork from [`isomorphic-git`](https://github.com/isomorphic-git/isomorphic-git) — the original library created by [Billie Hilton](https://github.com/billiegoose). *Dimorphic* means capable of taking two distinct forms: this fork can operate in either **libgit2-compatible mode** (the new default) or **legacy isomorphic-git mode**, making it a drop-in replacement for both.

> **New in 2.0:** libgit2-compatible behavior is now the **default**. To restore the old behavior, set `ISOGIT_LEGACY=1`. See [`UPGRADING.md`](./UPGRADING.md) for full details.

## What's different from isomorphic-git?

This is a substantial fork. The headline changes:

- **libgit2 parity by default** — remote discovery, ref parsing, capability negotiation, and error surfaces all match libgit2's behavior out of the box.
- **SSH transport** — clone, fetch, and push over `ssh://` and `git@` URLs via the optional [`ssh2`](https://www.npmjs.com/package/ssh2) peer dependency.
- **SOCKS proxy support** — pass a `proxy: 'socks5://...'` option to any remote operation via the optional [`socks-proxy-agent`](https://www.npmjs.com/package/socks-proxy-agent) peer dependency.
- **Extended API surface** — new APIs covering the full libgit2 module list: `repositoryState`, `mergeAnalysis`, `revwalk`, `graphAheadBehind`, `packBuilderNew`, `mailmapFromRepository`, `odbAddBackend`, `stash`, `worktreeList`, and more.
- **CLI renamed** — the CLI binary is now `dimogit` (was `isogit`).

The original `isomorphic-git` behavior is preserved and accessible; it just requires an opt-out flag now.

## Goals

`dimorphic-git` aims for 100% interoperability with the canonical git implementation **and** 100% API parity with libgit2. It does all its operations by modifying files in a `.git` directory just like the git you are used to. The included `dimogit` CLI can operate on git repositories on your desktop or server.

This library aims to be a complete solution with no assembly required. The API has been designed with modern tools like Rollup and Webpack in mind. By providing functionality as individual functions, code bundlers can produce smaller bundles by including only the functions your application uses.

The project includes type definitions so you can enjoy static type-checking and intelligent code completion in editors like VS Code and [CodeSandbox](https://codesandbox.io).

## Supported Environments

The following environments are tested in CI and will continue to be supported until the next breaking version:

<table width="100%">
<tr>
<td align="center"><img src="https://raw.githubusercontent.com/dimorphic-git/dimorphic-git/main/website/static/img/browsers/node.webp" alt="" width="64" height="64"><br> Node 14+</td>
<td align="center"><img src="https://raw.githubusercontent.com/alrra/browser-logos/bc47e4601d2c1fd46a7912f9aed5cdda4afdb301/src/chrome/chrome.svg?sanitize=true" alt="" width="64" height="64"><br> Chrome 79+</td>
<td align="center"><img src="https://raw.githubusercontent.com/alrra/browser-logos/bc47e4601d2c1fd46a7912f9aed5cdda4afdb301/src/edge/edge.svg?sanitize=true" alt="" width="64" height="64"><br> Edge 79+</td>
<td align="center"><img src="https://raw.githubusercontent.com/alrra/browser-logos/bc47e4601d2c1fd46a7912f9aed5cdda4afdb301/src/firefox/firefox.svg?sanitize=true" alt="" width="64" height="64"><br> Firefox 72+</td>
<td align="center"><img src="https://raw.githubusercontent.com/alrra/browser-logos/bc47e4601d2c1fd46a7912f9aed5cdda4afdb301/src/safari/safari_64x64.png" alt="" width="64" height="64"><br> Safari 13+</td>
<td align="center"><img src="https://upload.wikimedia.org/wikipedia/commons/6/64/Android_logo_2019_%28stacked%29.svg" alt="" width="64" height="64"><br> Android 10+</td>
<td align="center"><img src="https://upload.wikimedia.org/wikipedia/commons/d/d6/IOS_13_logo.svg" alt="" width="64" height="64"><br> iOS 13+</td>
</tr>
</table>

## libgit2 Feature Parity

`dimorphic-git` targets **100% feature parity with libgit2** — a complete, drop-in replacement for libgit2 in JavaScript/TypeScript environments. No native modules, no WASM, pure JS.

### Coverage: 100% full parity (45/45 API modules)

| Category | APIs | Status |
|---|---|---|
| **Core Objects** | blob, commit, tree, tag, object, oid, signature | ✅ Full |
| **References** | refs, branch, refspec, reflog, transaction | ✅ Full |
| **Repository** | init, state, config, ignore | ✅ Full |
| **Index** | add, remove, update, conflicts | ✅ Full |
| **Diff & Patch** | tree-to-tree, index-to-workdir, stat, rename detection, patch, apply, email | ✅ Full |
| **Merge** | merge, merge analysis, merge base | ✅ Full |
| **History** | cherry-pick, rebase, revert, reset (soft/mixed/hard) | ✅ Full |
| **Remote** | clone, fetch, push, pull, remote management | ✅ Full |
| **Traversal** | log, walk, revwalk, revparse, describe, graph | ✅ Full |
| **Attributes** | gitattributes query, content filters | ✅ Full |
| **ODB** | read, write, exists, custom backends, pack builder, indexer | ✅ Full |
| **Notes** | add, remove, read, list, foreach | ✅ Full |
| **Submodules** | list, status, init, deinit, sync, add | ✅ Full |
| **Blame** | blame | ✅ Full |
| **Other** | stash, pathspec, mailmap, sparse checkout, shallow | ✅ Full |
| **Message** | commit message cleanup, trailer parsing | ✅ Full |
| **Worktree** | list, add, lock/unlock, prune | ✅ Full |
| **SSH Transport** | clone, fetch, push over SSH (via ssh2) | ✅ Full |
| **SOCKS Proxy** | SOCKS4/5 proxy via socks-proxy-agent | ✅ Full |

For the full API-by-API mapping, see [`docs/compat/PARITY-GAP.md`](docs/compat/PARITY-GAP.md).

### New APIs (highlights)

```js
import git from 'dimorphic-git'

// Repository state detection
const state = await git.repositoryState({ fs, dir })  // 'MERGE', 'REBASE_INTERACTIVE', etc.

// Merge analysis
const { analysis } = await git.mergeAnalysis({ fs, dir, theirs: 'feature' })

// Configurable revision walking
await git.revwalk({ fs, dir, include: ['HEAD'], sort: git.SORT.TOPOLOGICAL | git.SORT.TIME })

// Graph analysis
const { ahead, behind } = await git.graphAheadBehind({ fs, dir, local: 'main', upstream: 'origin/main' })

// Pack builder
const builder = await git.packBuilderNew({ fs, dir })
await builder.insertCommit(oid)
const { packfile } = await builder.write()

// Mailmap resolution
const mm = await git.mailmapFromRepository({ fs, dir })
const { name, email } = mm.resolve('Old Name', 'old@email.com')

// Custom ODB backends
git.odbAddBackend({ gitdir, backend: myCustomStorage, priority: 10 })

// SSH transport (requires: npm install ssh2)
await git.clone({
  fs, dir, http,
  url: 'git@github.com:user/repo.git',
  onAuth: () => ({ privateKey: fs.readFileSync('~/.ssh/id_ed25519', 'utf8') })
})

// SOCKS proxy (requires: npm install socks-proxy-agent)
await git.clone({
  fs, dir, http,
  url: 'https://github.com/user/repo.git',
  proxy: 'socks5://localhost:1080',
})
```

## Install

```
npm install dimorphic-git
```

Optional peer dependencies for additional transport features:

```
npm install ssh2            # SSH transport (git@, ssh:// URLs)
npm install socks-proxy-agent  # SOCKS4/5 proxy support
```

## Getting Started

`dimorphic-git` works in both Node.js and the browser. Rather than relying on the `fs` and `http` modules directly, it lets you bring your own file system and HTTP client.

**Node.js:**

```js
const path = require('path')
const git = require('dimorphic-git')
const http = require('dimorphic-git/http/node')
const fs = require('fs')

const dir = path.join(process.cwd(), 'test-clone')
git.clone({ fs, http, dir, url: 'https://github.com/dimorphic-git/dimorphic-git' }).then(console.log)
```

**Browser:**

For the browser you'll need a virtual filesystem. The easiest option is [LightningFS](https://github.com/isomorphic-git/lightning-fs):

```html
<script src="https://unpkg.com/@isomorphic-git/lightning-fs"></script>
<script src="https://unpkg.com/dimorphic-git"></script>
<script type="module">
import http from 'https://unpkg.com/dimorphic-git/http/web/index.js'
const fs = new LightningFS('fs')

const dir = '/test-clone'
await git.clone({ fs, http, dir, url: 'https://github.com/dimorphic-git/dimorphic-git', corsProxy: 'https://cors.isomorphic-git.org' })
</script>
```

dimorphic-git should also work with [ZenFS](https://github.com/zen-fs/core) and [Filer](https://github.com/filerjs/filer).

**ES modules:**

```js
import git from 'dimorphic-git'
// or named imports for tree-shaking:
import { clone, commit, push } from 'dimorphic-git'
```

### CORS support

Due to browser same-origin restrictions, cloning from arbitrary hosts requires a CORS proxy. For this purpose, [@isomorphic-git/cors-proxy](https://github.com/isomorphic-git/cors-proxy) exists — you can self-host it or use [CloudFlare Workers](https://gist.github.com/tomlarkworthy/cf1d4ceabeabdb6d1628575ab3a83acf).

For testing or small projects, [https://cors.isomorphic-git.org](https://cors.isomorphic-git.org) is a free community-run proxy.

| Service             | Supports CORS requests |
| ------------------- | ---------------------- |
| Gogs (self-hosted)  | ✔ |
| Gitea (self-hosted) | ✔ |
| Azure DevOps        | ✔ (requires authentication) |
| Gitlab              | ❌ |
| Bitbucket           | ❌ |
| Github              | ❌ |

### `dimogit` CLI

`dimorphic-git` ships with a simple CLI tool named `dimogit`. It translates command-line arguments into the equivalent JS API calls, always assuming the current working directory is the git root (`{ dir: '.' }`).

```sh
dimogit clone --url=https://github.com/dimorphic-git/dimorphic-git --depth=1
dimogit log
dimogit status
```

The CLI is a lightweight inspection tool, not a full `git` replacement.

## Supported Git commands

This project follows semantic versioning — API changes will always be backwards compatible until the next major version bump.

### commands

<!-- API-LIST:START - Do not remove or modify this section -->
<!-- prettier-ignore-start -->
<!-- markdownlint-disable -->

<!-- autogenerated_by: __tests__/__helpers__/generate-docs.cjs -->

- [abortMerge](https://dimorphic-git.github.io/docs/abortMerge.html)
- [add](https://dimorphic-git.github.io/docs/add.html)
- [addNote](https://dimorphic-git.github.io/docs/addNote.html)
- [addRemote](https://dimorphic-git.github.io/docs/addRemote.html)
- [annotatedTag](https://dimorphic-git.github.io/docs/annotatedTag.html)
- [branch](https://dimorphic-git.github.io/docs/branch.html)
- [checkout](https://dimorphic-git.github.io/docs/checkout.html)
- [clone](https://dimorphic-git.github.io/docs/clone.html)
- [commit](https://dimorphic-git.github.io/docs/commit.html)
- [currentBranch](https://dimorphic-git.github.io/docs/currentBranch.html)
- [deleteBranch](https://dimorphic-git.github.io/docs/deleteBranch.html)
- [deleteRef](https://dimorphic-git.github.io/docs/deleteRef.html)
- [deleteRemote](https://dimorphic-git.github.io/docs/deleteRemote.html)
- [deleteTag](https://dimorphic-git.github.io/docs/deleteTag.html)
- [expandOid](https://dimorphic-git.github.io/docs/expandOid.html)
- [expandRef](https://dimorphic-git.github.io/docs/expandRef.html)
- [fastForward](https://dimorphic-git.github.io/docs/fastForward.html)
- [fetch](https://dimorphic-git.github.io/docs/fetch.html)
- [findMergeBase](https://dimorphic-git.github.io/docs/findMergeBase.html)
- [findRoot](https://dimorphic-git.github.io/docs/findRoot.html)
- [getConfig](https://dimorphic-git.github.io/docs/getConfig.html)
- [getConfigAll](https://dimorphic-git.github.io/docs/getConfigAll.html)
- [getRemoteInfo](https://dimorphic-git.github.io/docs/getRemoteInfo.html)
- [getRemoteInfo2](https://dimorphic-git.github.io/docs/getRemoteInfo2.html)
- [hashBlob](https://dimorphic-git.github.io/docs/hashBlob.html)
- [indexPack](https://dimorphic-git.github.io/docs/indexPack.html)
- [init](https://dimorphic-git.github.io/docs/init.html)
- [isDescendent](https://dimorphic-git.github.io/docs/isDescendent.html)
- [isIgnored](https://dimorphic-git.github.io/docs/isIgnored.html)
- [listBranches](https://dimorphic-git.github.io/docs/listBranches.html)
- [listFiles](https://dimorphic-git.github.io/docs/listFiles.html)
- [listNotes](https://dimorphic-git.github.io/docs/listNotes.html)
- [listRefs](https://dimorphic-git.github.io/docs/listRefs.html)
- [listRemotes](https://dimorphic-git.github.io/docs/listRemotes.html)
- [listServerRefs](https://dimorphic-git.github.io/docs/listServerRefs.html)
- [listTags](https://dimorphic-git.github.io/docs/listTags.html)
- [log](https://dimorphic-git.github.io/docs/log.html)
- [merge](https://dimorphic-git.github.io/docs/merge.html)
- [packObjects](https://dimorphic-git.github.io/docs/packObjects.html)
- [pull](https://dimorphic-git.github.io/docs/pull.html)
- [push](https://dimorphic-git.github.io/docs/push.html)
- [readBlob](https://dimorphic-git.github.io/docs/readBlob.html)
- [readCommit](https://dimorphic-git.github.io/docs/readCommit.html)
- [readNote](https://dimorphic-git.github.io/docs/readNote.html)
- [readObject](https://dimorphic-git.github.io/docs/readObject.html)
- [readTag](https://dimorphic-git.github.io/docs/readTag.html)
- [readTree](https://dimorphic-git.github.io/docs/readTree.html)
- [remove](https://dimorphic-git.github.io/docs/remove.html)
- [removeNote](https://dimorphic-git.github.io/docs/removeNote.html)
- [renameBranch](https://dimorphic-git.github.io/docs/renameBranch.html)
- [resetIndex](https://dimorphic-git.github.io/docs/resetIndex.html)
- [resolveRef](https://dimorphic-git.github.io/docs/resolveRef.html)
- [setConfig](https://dimorphic-git.github.io/docs/setConfig.html)
- [stash](https://dimorphic-git.github.io/docs/stash.html)
- [status](https://dimorphic-git.github.io/docs/status.html)
- [statusMatrix](https://dimorphic-git.github.io/docs/statusMatrix.html)
- [tag](https://dimorphic-git.github.io/docs/tag.html)
- [updateIndex](https://dimorphic-git.github.io/docs/updateIndex.html)
- [version](https://dimorphic-git.github.io/docs/version.html)
- [walk](https://dimorphic-git.github.io/docs/walk.html)
- [writeBlob](https://dimorphic-git.github.io/docs/writeBlob.html)
- [writeCommit](https://dimorphic-git.github.io/docs/writeCommit.html)
- [writeObject](https://dimorphic-git.github.io/docs/writeObject.html)
- [writeRef](https://dimorphic-git.github.io/docs/writeRef.html)
- [writeTag](https://dimorphic-git.github.io/docs/writeTag.html)
- [writeTree](https://dimorphic-git.github.io/docs/writeTree.html)

<!-- markdownlint-enable -->
<!-- prettier-ignore-end -->
<!-- API-LIST:END -->

## Contributing to `dimorphic-git`

The development setup is similar to that of a large web application. We use Facebook's [Jest](https://jestjs.io) for testing.

You'll need [node.js](https://nodejs.org) installed, but everything else is a devDependency.

```sh
git clone https://github.com/dimorphic-git/dimorphic-git
cd dimorphic-git
npm install
npm test
```

Check out the [`CONTRIBUTING`](./CONTRIBUTING.md) document for more instructions.

## Similar projects

- [isomorphic-git](https://github.com/isomorphic-git/isomorphic-git) — the upstream project this fork is based on
- [js-git](https://github.com/creationix/js-git)
- [es-git](https://github.com/es-git/es-git)

## Acknowledgments

`dimorphic-git` is a fork of [`isomorphic-git`](https://github.com/isomorphic-git/isomorphic-git), which was created by [Billie Hilton](https://github.com/billiegoose). The core architecture, pack protocol implementation, and the vast majority of the original test suite are her work. Without that foundation this project would not exist.

`isomorphic-git` itself would not have been possible without the pioneering work by @creationix and @chrisdickinson. Git is a tricky binary mess, and without their examples and modules the original author would not have been able to come close to finishing it.

## License

This work is released under [The MIT License](https://opensource.org/licenses/MIT)
