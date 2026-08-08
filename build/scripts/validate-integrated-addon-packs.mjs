import fs from 'node:fs/promises'
import path from 'node:path'

const root = process.cwd()
const catalogPath = path.join(root, 'addons', 'catalog.json')
const packsRoot = path.join(root, 'addons', 'packs')
const catalog = JSON.parse(await fs.readFile(catalogPath, 'utf8'))
const catalogAddons = Array.isArray(catalog.addons) ? catalog.addons : []
const forbidden = new Set(['elephant.addon-packs', 'elephant.excalidraw'])

if (!catalogAddons.length) throw new Error('Integrated addon catalogue is empty')

const entries = new Map()
for (const entry of catalogAddons) {
  if (!entry?.id || entries.has(entry.id)) {
    throw new Error(`Integrated addon catalogue contains a missing or duplicate id: ${entry?.id || '<missing>'}`)
  }
  if (entry.official !== true || !String(entry.id).startsWith('elephant.')) {
    throw new Error(`Integrated addon catalogue contains a non-official entry: ${entry.id}`)
  }

  const manifestPath = path.join(root, 'addons', entry.manifestPath)
  const entryPath = path.join(root, 'addons', entry.entryPath)
  const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'))
  await fs.access(entryPath)
  if (manifest.id !== entry.id || manifest.version !== entry.version) {
    throw new Error(`Catalogue/manifest mismatch for ${entry.id}`)
  }
  entries.set(entry.id, { ...entry, manifest })
}

const packFiles = (await fs.readdir(packsRoot))
  .filter((name) => name.endsWith('.enaddonpack'))
  .sort()

if (!packFiles.length) throw new Error('No integrated addon packs were found')

const packIds = new Map()
for (const fileName of packFiles) {
  const pack = JSON.parse(await fs.readFile(path.join(packsRoot, fileName), 'utf8'))
  if (pack.format !== 'elephantnote-addon-pack' || pack.version !== 1) {
    throw new Error(`${fileName}: unsupported pack format`)
  }
  if (pack.protected !== true) {
    throw new Error(`${fileName}: integrated pack must remain protected`)
  }
  if (!Array.isArray(pack.addons) || !pack.addons.length) {
    throw new Error(`${fileName}: pack must contain addons`)
  }

  const positions = new Map()
  for (const [index, item] of pack.addons.entries()) {
    if (forbidden.has(item.id)) throw new Error(`${fileName}: core feature serialized as addon: ${item.id}`)
    if (positions.has(item.id)) throw new Error(`${fileName}: duplicate addon ${item.id}`)
    positions.set(item.id, index)

    const catalogEntry = entries.get(item.id)
    if (!catalogEntry) throw new Error(`${fileName}: addon absent from integrated catalogue: ${item.id}`)
    if (item.source !== 'official') throw new Error(`${fileName}: first-party addon must use source=official: ${item.id}`)
    if (item.enabled !== true) throw new Error(`${fileName}: integrated addon must be enabled: ${item.id}`)
    if (item.version !== catalogEntry.version) {
      throw new Error(`${fileName}: version mismatch for ${item.id}: pack=${item.version} catalog=${catalogEntry.version}`)
    }
  }

  for (const item of pack.addons) {
    const manifest = entries.get(item.id).manifest
    for (const dependencyId of Object.keys(manifest.requires || {})) {
      if (!positions.has(dependencyId)) throw new Error(`${fileName}: ${item.id} requires missing ${dependencyId}`)
      if (positions.get(dependencyId) > positions.get(item.id)) {
        throw new Error(`${fileName}: ${dependencyId} must be ordered before ${item.id}`)
      }
    }
  }

  packIds.set(fileName, new Set(positions.keys()))
  console.log(`[addon-pack] valid file=${fileName} addons=${pack.addons.length}`)
}

const officialIds = new Set(entries.keys())
const developIds = packIds.get('develop-parity.enaddonpack')
const baseIds = packIds.get('base.enaddonpack')
if (!developIds || !baseIds) {
  throw new Error('Protected Base and Develop parity packs are both required')
}

const difference = (left, right) => [...left].filter((id) => !right.has(id)).sort()
const developMissing = difference(officialIds, developIds)
const developExtra = difference(developIds, officialIds)
if (developMissing.length || developExtra.length) {
  throw new Error(`Develop parity mismatch: missing=${JSON.stringify(developMissing)} extra=${JSON.stringify(developExtra)}`)
}

const expectedBase = new Set([...officialIds].filter((id) => id !== 'elephant.calendar'))
const baseMissing = difference(expectedBase, baseIds)
const baseExtra = difference(baseIds, expectedBase)
if (baseMissing.length || baseExtra.length) {
  throw new Error(`Elephant Base mismatch: missing=${JSON.stringify(baseMissing)} extra=${JSON.stringify(baseExtra)}`)
}

const developOnly = difference(developIds, baseIds)
if (developOnly.length !== 1 || developOnly[0] !== 'elephant.calendar') {
  throw new Error(`Calendar must be the only semantic difference between protected packs: ${JSON.stringify(developOnly)}`)
}

console.log(`[addon-pack] protected parity valid official=${officialIds.size} base=${baseIds.size}`)
