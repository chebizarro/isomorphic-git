const path = require('path')
const fs = require('fs')
const git = require('dimorphic-git')
git.plugins.set('fs', fs)

let dir = path.join(__dirname, '../..')

;(async () => {
  let commit = await git.log({ dir, depth: 1 })
  commit = commit[0]
  let message = commit.message

  dir = path.join(dir, 'website/build/dimorphic-git.github.io')

  await git.init({ dir })
  await git.addRemote({
    dir,
    remote: 'origin',
    url: 'https://github.com/dimorphic-git/dimorphic-git.github.io'
  })
  await git.fetch({
    dir,
    depth: 1,
    ref: 'main'
  })
  await git.checkout({
    dir,
    ref: 'main',
    noCheckout: true
  })
  await git.add({
    dir,
    filepath: '.'
  })
  await git.commit({
    dir,
    author: commit.author,
    message: commit.message,
    committer: {
      name: 'dimorphic-git-bot',
      email: 'wmhilton+dimorphic-git-bot@gmail.com',
    }
  })
  await git.push({
    dir,
    oauth2format: 'github',
    token: process.env.GITHUB_TOKEN
  })
})()
