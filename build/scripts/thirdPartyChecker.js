'use strict'

const fs = require('fs')
const path = require('path')

const configuredModulesDir = path.resolve(__dirname, '../../Elephant/node_modules')
const checker = (() => {
  try {
    return require('license-checker')
  } catch (error) {
    const fallback = path.join(configuredModulesDir, 'license-checker')
    if (!fs.existsSync(fallback)) throw error
    return require(fallback)
  }
})()

const normalizeLicenseValue = (licenses = '') => Array.isArray(licenses) ? licenses.join(' OR ') : String(licenses || '')

const isUsableLicenseMetadata = (licenses = '') => {
  const value = normalizeLicenseValue(licenses).trim()
  if (!value) return false
  if (/^(UNKNOWN|UNLICENSED)$/i.test(value)) return false
  return true
}

const withRootNodeModules = (rootDir, callback) => {
  const rootModules = path.join(rootDir, 'node_modules')
  if (fs.existsSync(rootModules) || !fs.existsSync(configuredModulesDir)) {
    callback(() => {})
    return
  }

  fs.symlinkSync(configuredModulesDir, rootModules, process.platform === 'win32' ? 'junction' : 'dir')
  callback(() => {
    try {
      const stat = fs.lstatSync(rootModules)
      if (stat.isSymbolicLink()) fs.unlinkSync(rootModules)
    } catch {
      // Validation cleanup must not hide the checker result.
    }
  })
}

const getLicenses = (rootDir, callback) => {
  withRootNodeModules(rootDir, (cleanup) => {
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
        cleanup()
        callback(err, packages, checker)
      }
    )
  })
}

// Check that all production dependencies expose usable license metadata.
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
      .filter(([, metadata]) => !isUsableLicenseMetadata(metadata.licenses))
      .map(([name, metadata]) => ({ name, licenses: metadata.licenses }))

    if (disallowed.length) {
      console.log('[ERROR] Dependencies without usable license metadata:')
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
