#!/usr/bin/env node

import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const root = resolve(import.meta.dirname, '../..')

const readJson = (relativePath) => JSON.parse(readFileSync(join(root, relativePath), 'utf8'))
const readText = (relativePath) => readFileSync(join(root, relativePath), 'utf8')

const parseVersion = (value, label) => {
  const match = String(value || '').trim().replace(/^v/, '').match(/^(\d+)\.(\d+)\.(\d+)(?:-[0-9A-Za-z.-]+)?$/)
  if (!match) throw new Error(label + ' is not a valid semantic version: ' + value)
  return { raw: String(value).trim(), major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]) }
}

const compareVersions = (left, right) => {
  for (const key of ['major', 'minor', 'patch']) {
    if (left[key] !== right[key]) return left[key] - right[key]
  }
  return 0
}

const appVersion = parseVersion(readJson('package.json').version, 'package.json version')
const tauriVersion = parseVersion(readJson('Elephant/backend/tauri/tauri.conf.json').version, 'Tauri version')
const cargoVersion = parseVersion(
  readText('Elephant/backend/tauri/Cargo.toml').match(/^version\s*=\s*"([^"]+)"/m)?.[1],
  'Cargo.toml version'
)
const lockVersion = parseVersion(
  readText('Elephant/backend/tauri/Cargo.lock').match(/\[\[package\]\]\s*name = "elephantnote-tauri"\s*version = "([^"]+)"/s)?.[1],
  'Cargo.lock version'
)

const versions = [appVersion, tauriVersion, cargoVersion, lockVersion]
if (versions.some((version) => compareVersions(version, appVersion) !== 0)) {
  throw new Error('Application version drift detected: ' + versions.map((version) => version.raw).join(', '))
}

const expectedVersion = process.env.ELEPHANT_RELEASE_VERSION || process.env.GITHUB_REF_NAME?.replace(/^v/, '')
if (expectedVersion) {
  const releaseVersion = parseVersion(expectedVersion, 'release tag')
  if (compareVersions(releaseVersion, appVersion) !== 0) {
    throw new Error('Release tag ' + releaseVersion.raw + ' does not match application version ' + appVersion.raw)
  }
}

const officialRoot = join(root, 'addons', 'official')
if (!existsSync(officialRoot)) {
  throw new Error('Official addons are not materialized; run pnpm addons:sync first')
}

let checkedAddons = 0
for (const entry of readdirSync(officialRoot, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue
  const manifestPath = join(officialRoot, entry.name, 'manifest.json')
  if (!existsSync(manifestPath)) continue
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  if (!manifest.minAppVersion) continue
  const minimum = parseVersion(manifest.minAppVersion, (manifest.id || entry.name) + ' minAppVersion')
  if (compareVersions(minimum, appVersion) > 0) {
    throw new Error((manifest.id || entry.name) + ' requires ' + minimum.raw + ', but the app is ' + appVersion.raw)
  }
  checkedAddons += 1
}

console.log('[release-version] app=' + appVersion.raw + ' canonical-files=4 official-addons=' + checkedAddons)
