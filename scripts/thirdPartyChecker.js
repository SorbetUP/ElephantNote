'use strict'

const checker = require('license-checker')

const ALLOWED_LICENSES = new Set([
  'Unlicense',
  'WTFPL',
  'ISC',
  'MIT',
  'MIT*',
  'BSD',
  '0BSD',
  'BSD-2-Clause',
  'BSD-3-Clause',
  'Apache',
  'Apache-2.0',
  'MPL-2.0',
  'CC0-1.0',
  'CC-BY-4.0',
  'CC-BY-3.0',
  'BlueOak-1.0.0',
  'Python-2.0',
  'ODC-By-1.0'
])

const LICENSE_OPERATORS = new Set(['AND', 'OR', 'WITH'])
const LICENSE_EXCEPTIONS = new Set(['LLVM-exception'])

const normalizeLicenseValue = (licenses = '') => Array.isArray(licenses) ? licenses.join(' OR ') : String(licenses || '')

const getLicenseTokens = (licenses = '') => {
  const value = normalizeLicenseValue(licenses)
  return value
    .replace(/[(),]/g, ' ')
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean)
    .filter((token) => !LICENSE_OPERATORS.has(token))
}

const hasLicenseFileReference = (licenses = '') => /^SEE LICENSE IN /i.test(normalizeLicenseValue(licenses).trim())

const isAllowedLicenseToken = (token = '') => {
  if (ALLOWED_LICENSES.has(token) || LICENSE_EXCEPTIONS.has(token)) return true
  if (token.startsWith('Apache-')) return ALLOWED_LICENSES.has('Apache')
  if (token.startsWith('BSD-')) return ALLOWED_LICENSES.has('BSD')
  return false
}

const isAllowedLicenseExpression = (licenses = '') => {
  if (hasLicenseFileReference(licenses)) return true
  const tokens = getLicenseTokens(licenses)
  return tokens.length > 0 && tokens.every(isAllowedLicenseToken)
}

const getLicenses = (rootDir, callback) => {
  checker.init(
    {
      start: rootDir,
      production: true,
      development: false,
      direct: true,
      excludePackages: '@marktext/file-icons', // MIT licensed but license-checker may not detect it
      json: true
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

    const disallowed = Object.entries(packages)
      .filter(([, metadata]) => !isAllowedLicenseExpression(metadata.licenses))
      .map(([name, metadata]) => ({ name, licenses: metadata.licenses }))

    if (disallowed.length) {
      console.log('[ERROR] Disallowed production dependency licenses:')
      for (const item of disallowed) {
        console.log(`- ${item.name}: ${item.licenses}`)
      }
      process.exit(1)
    }

    console.log(checker.asSummary(packages))
  })
}

module.exports = {
  getLicenses,
  validateLicenses
}
