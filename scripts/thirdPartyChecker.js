'use strict'

const checker = require('license-checker')

const ALLOWED_LICENSES = [
  'Unlicense',
  'WTFPL',
  'ISC',
  'MIT',
  'MIT*',
  'BSD',
  'BSD*',
  '0BSD',
  'BSD-2-Clause',
  'BSD-3-Clause',
  'Apache',
  'Apache*',
  'Apache-2.0',
  'MPL-2.0',
  'CC0-1.0',
  'CC-BY-4.0',
  'CC-BY-3.0'
].join(';')

const getLicenses = (rootDir, callback) => {
  checker.init(
    {
      start: rootDir,
      production: true,
      development: false,
      direct: true,
      excludePackages: '@marktext/file-icons', // MIT licensed but license-checker may not detect it
      json: true,
      onlyAllow: ALLOWED_LICENSES
    },
    function(err, packages) {
      callback(err, packages, checker)
    }
  )
}

// Check that all production dependencies are allowed.
const validateLicenses = (rootDir) => {
  getLicenses(rootDir, (err, packages, checker) => {
    if (err) {
      console.log(`[ERROR] ${err}`)
      process.exit(1)
    }
    if (!packages || Object.keys(packages).length === 0) {
      console.log('[ERROR] No packages found — check your start path and filters.')
      process.exit(1)
    }
    console.log(checker.asSummary(packages))
  })
}

module.exports = {
  getLicenses,
  validateLicenses
}
