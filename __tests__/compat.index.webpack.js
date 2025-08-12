// compat-only Jasmine tests entry for Karma
// Polyfill inline snapshots for Jasmine
require('./__helpers__/jasmine-inline-snapshots.js')

// Explicitly require only the compat jasmine specs
require('./compat.remote-info.jasmine.js')
require('./compat.fetch.jasmine.js')
require('./compat.push.jasmine.js')
