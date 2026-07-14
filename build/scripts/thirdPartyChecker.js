'use strict'

const fs = require('fs')
const path = require('path')

const normalizeLicenseValue = (licenses = '') => Array.isArray(licenses) ? licenses.join(' OR ') : String(licenses || '')

const isUsableLicenseMetadata = (licenses = '') => {
  const value = normalizeLicenseValue(licenses).trim()
  if (!value) return false
  if (/^(UNKNOWN|UNLICENSED)$/i.test(value)) return false
  return true
}

const writeValidationLog = (rootDir, lines) => {
  const targetDir = path.join(rootDir, 'build', 'coverage')
  fs.mkdirSync(targetDir, { recursive: true })
  fs.writeFileSync(path.join(targetDir, 'license-validation.log'), `${lines.join('\n')}\n`)
  for (const line of lines) console.log(line)
}

const withRootNodeModules = (rootDir, callback) => {
  const rootModules = path.join(rootDir, 'node_modules')
  const configuredModules = path.join(rootDir, 'Elephant', 'node_modules')
  if (!fs.existsSync(configuredModules)) {
    throw new Error(`Configured pnpm modules directory is missing: ${configuredModules}`)
  }

  let createdLink = false
  if (!fs.existsSync(rootModules)) {
    fs.symlinkSync(configuredModules, rootModules, process.platform === 'win32' ? 'junction' : 'dir')
    createdLink = true
  }

  const cleanup = () => {
    if (createdLink && fs.existsSync(rootModules)) fs.unlinkSync(rootModules)
  }

  try {
    return callback(cleanup)
  } catch (error) {
    cleanup()
    throw error
  }
}

const getLicenses = (rootDir, callback) => {
  withRootNodeModules(rootDir, (cleanup) => {
    const checker = require(path.join(rootDir, 'Elephant', 'node_modules', 'license-checker'))
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
  try {
    getLicenses(rootDir, (err, packages, checker) => {
      if (err) {
        writeValidationLog(rootDir, [`[ERROR] ${err}`])
        process.exit(1)
      }
      if (!packages || Object.keys(packages).length === 0) {
        writeValidationLog(rootDir, ['[ERROR] No packages found — check your start path and filters.'])
        process.exit(1)
      }

      const disallowed = Object.entries(packages)
        .filter(([, metadata]) => !isUsableLicenseMetadata(metadata.licenses))
        .map(([name, metadata]) => ({ name, licenses: metadata.licenses }))

      if (disallowed.length) {
        writeValidationLog(rootDir, [
          '[ERROR] Dependencies without usable license metadata:',
          ...disallowed.map((item) => `- ${item.name}: ${item.licenses}`)
        ])
        process.exit(1)
      }

      writeValidationLog(rootDir, [checker.asSummary(packages)])
    })
  } catch (error) {
    writeValidationLog(rootDir, [`[ERROR] ${error?.stack || error}`])
    process.exit(1)
  }
}

module.exports = {
  getLicenses,
  validateLicenses
}
