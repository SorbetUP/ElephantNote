'use strict'

const { spawnSync } = require('child_process')
const path = require('path')

const rootDir = path.resolve(__dirname, '../..')
const result = spawnSync('pnpm', ['licenses', 'list', '--prod', '--json'], {
  cwd: rootDir,
  encoding: 'utf8',
  maxBuffer: 32 * 1024 * 1024
})

if (result.error) {
  console.error(`[ERROR] Unable to execute pnpm licenses list: ${result.error.message}`)
  process.exit(1)
}

if (result.status !== 0) {
  process.stderr.write(result.stderr || '')
  process.stdout.write(result.stdout || '')
  process.exit(result.status || 1)
}

let report
try {
  report = JSON.parse(result.stdout || '{}')
} catch (error) {
  console.error(`[ERROR] pnpm returned invalid license JSON: ${error.message}`)
  process.exit(1)
}

const entries = Object.entries(report || {})
if (!entries.length) {
  console.error('[ERROR] No production dependency license metadata was returned.')
  process.exit(1)
}

const unusable = []
let packageCount = 0
for (const [license, packages] of entries) {
  const normalizedLicense = String(license || '').trim()
  const packageEntries = Array.isArray(packages)
    ? packages
    : packages && typeof packages === 'object'
      ? Object.values(packages).flat()
      : []
  packageCount += packageEntries.length
  if (!normalizedLicense || /^(UNKNOWN|UNLICENSED)$/i.test(normalizedLicense)) {
    unusable.push({ license: normalizedLicense || 'missing', packages: packageEntries })
  }
}

if (unusable.length) {
  console.error('[ERROR] Dependencies without usable license metadata:')
  for (const item of unusable) {
    const names = item.packages.map((entry) => entry?.name || entry?.version || String(entry)).filter(Boolean)
    console.error(`- ${item.license}: ${names.join(', ') || 'unknown package'}`)
  }
  process.exit(1)
}

console.log(`[licenses] valid groups=${entries.length} packages=${packageCount}`)
for (const [license, packages] of entries) {
  const count = Array.isArray(packages)
    ? packages.length
    : packages && typeof packages === 'object'
      ? Object.values(packages).flat().length
      : 0
  console.log(`${license}: ${count}`)
}
