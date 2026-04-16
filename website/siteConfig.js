/**
 * Copyright (c) 2017-present, Facebook, Inc.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/* List of projects/orgs using your project for the users page */
const users = require('./users')

const siteConfig = {
  title: 'dimorphic-git' /* title for your website */,
  tagline: 'A pure JavaScript implementation of git for node and browsers!',
  url: 'https://dimorphic-git.org' /* your website url */,
  cname: 'dimorphic-git.org' /* gets overwritten each time */,
  baseUrl: '/' /* base url for your project */,
  editUrl: 'https://github.com/dimorphic-git/dimorphic-git/edit/main/docs/',
  headerLinks: [
    {
      doc: 'alphabetic',
      label: 'API Docs'
    },
    { doc: 'quickstart', label: 'Guide' },
    { blog: true, label: 'Blog' },
    {
      href: 'https://github.com/dimorphic-git/dimorphic-git',
      label: 'GitHub'
    },
    {
      href: 'https://npmjs.com/package/dimorphic-git',
      label: 'npm'
    }
  ],
  users,
  /* path to images for header/footer */
  headerIcon: 'img/dimorphic-git-logo.svg',
  footerIcon: 'img/dimorphic-git-logo.svg',
  twitterImage: 'img/favicon/android-chrome-192x192.png',
  favicon: 'img/favicon.png',
  /* colors for website */
  colors: {
    primaryColor: '#000' /*'#2E8555'*/,
    secondaryColor: '#000' /*'#205C3B'*/
  },
  // This copyright info is used in /core/Footer.js and blog rss/atom feeds.
  copyright: 'Copyright © ' +
    new Date().getFullYear() +
    ' Isomorphic-git Contributors',
  organizationName: 'dimorphic-git', // or set an env variable ORGANIZATION_NAME
  projectName: 'dimorphic-git.github.io', // or set an env variable PROJECT_NAME
  highlight: {
    // Highlight.js theme to use for syntax highlighting in code blocks
    theme: 'default'
  },
  docsSideNavCollapsible: true,
  scripts: [
    '/js/announcement.js',
  ],
  homepagescripts: [
    'https://platform.twitter.com/widgets.js',
  ],
  footerscripts: [
    '/js/gitter.js',
    '/js/sidecar.v1.js',
    // Used to transform the code blocks into editable examples
    '/js/codemirrorify.js',
    // dimorphic-git itself
    'https://unpkg.com/@isomorphic-git/lightning-fs',
    '/js/dimorphic-git/index.umd.min.js',
    // the tutorial
    { type: 'module', src: '/js/tutorial.js' },
    // the button on the home page
    { type: 'module', src: '/js/try-it-out-giturl.js' },
    // The object inspector - only appears after users run examples
    'https://unpkg.com/@webcomponents/shadydom',
    '/js/object-inspector.min.js',
    // minimal analytics
    { 'data-domain': 'dimorphic-git.org', src: 'https://plausible.io/js/plausible.js' }
  ],
  // stylesheets: ['./css/tutorial.css'],
  // You may provide arbitrary config keys to be used as needed by your template.
  repoUrl: 'https://github.com/dimorphic-git/dimorphic-git',
  algolia: {
    apiKey: 'ac63b0df4513e31143eef156f520056c',
    indexName: 'isomorphic_git',
    algoliaOptions: {
      typoTolerance: 'min',
      facetFilters: [ "language:LANGUAGE", "version:VERSION" ],
    }
  },
  cleanUrl: true,
}

module.exports = siteConfig
