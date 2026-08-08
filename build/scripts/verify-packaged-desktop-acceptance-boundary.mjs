#!/usr/bin/env node

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '../..')
const runnerPath = 'build/scripts/run-packaged-desktop-acceptance.mjs'

export const inspectPackagedRunner = (source, filename = '<memory>') => {
  const text = String(source || '')
  const errors = []

  const requiredClaims = [
    ['linux-appimage', "resolve(bundleRoot, 'appimage')"],
    ['macos-app', 'macos/Elephant.app/Contents/MacOS/Elephant'],
    ['windows-msi', "resolve(bundleRoot, 'msi')"],
    ['windows-nsis', "resolve(bundleRoot, 'nsis')"]
  ]

  for (const [format, marker] of requiredClaims) {
    if (!text.includes(format) || !text.includes(marker)) {
      errors.push(`${filename}: packaged acceptance must resolve the distributed ${format} artifact`)
    }
  }

  if (/resolve\(releaseRoot,\s*executableName\)/.test(text)) {
    errors.push(`${filename}: packaged acceptance must not fall back to the raw target/release executable`)
  }
  if (!text.includes('no distributed package executable found')) {
    errors.push(`${filename}: missing package must fail explicitly`)
  }
  if (!text.includes('ELEPHANT_PACKAGED_FORMAT: packagedFormat')) {
    errors.push(`${filename}: runner must expose the exact package format to the acceptance layer`)
  }

  return errors
}

const assertSensitivity = () => {
  const valid = `
resolve(bundleRoot, 'appimage'); packagedFormat = 'linux-appimage'
'macos/Elephant.app/Contents/MacOS/Elephant'; packagedFormat = 'macos-app'
resolve(bundleRoot, 'msi'); packagedFormat = 'windows-msi'
resolve(bundleRoot, 'nsis'); packagedFormat = 'windows-nsis'
console.error('no distributed package executable found')
ELEPHANT_PACKAGED_FORMAT: packagedFormat
`
  const invalid = `
const executable = resolve(releaseRoot, executableName)
ELEPHANT_PACKAGED_FORMAT: packagedFormat
`

  if (inspectPackagedRunner(valid, 'valid.mjs').length !== 0) {
    throw new Error('Packaged desktop guard self-test rejected the exact-artifact fixture')
  }
  if (inspectPackagedRunner(invalid, 'invalid.mjs').length < 5) {
    throw new Error('Packaged desktop guard self-test did not reject the raw release binary fallback')
  }
}

assertSensitivity()

const source = readFileSync(resolve(root, runnerPath), 'utf8')
const errors = inspectPackagedRunner(source, runnerPath)
if (errors.length > 0) {
  console.error('[packaged-desktop-boundary] exact artifact guard failed:')
  for (const error of errors) console.error(`- ${error}`)
  process.exit(1)
}

console.log('[packaged-desktop-boundary] Linux, macOS and Windows acceptance require distributed package artifacts')
