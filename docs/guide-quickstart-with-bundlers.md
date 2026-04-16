---
id: quickstart-with-bundlers
title: Quick Start (With bundlers)
sidebar_label: Quick Start (With bundlers)
---

Run the following command to add Isomorphic-git to your project:
```bash
npm install @isomorphic-git/lightning-fs dimorphic-git buffer
```

Here's a whirlwind tour of the main features of `dimorphic-git`.

First, let's set up LightningFS and dimorphic-git. *Note: I've already done this for you, which is why there is no RUN button for this code block.*

```js live
import LightningFS from '@isomorphic-git/lightning-fs';
import http from 'dimorphic-git/http/web';
import git from 'dimorphic-git';
import { Buffer } from 'buffer'

// Bundlers require Buffer to be defined on window
window.Buffer = Buffer;
// Initialize dimorphic-git with a file system
window.fs = new LightningFS('fs')
// I prefer using the Promisified version honestly
window.pfs = window.fs.promises
```

Now you can continue now by [picking a directory](guide-quickstart.md#picking-a-directory).