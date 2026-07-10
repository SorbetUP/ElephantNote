import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const source = path.join(root, 'docs', 'parity')
const target = path.join(root, 'agent', 'docs', 'project', 'parity')

if (!fs.existsSync(source)) {
  throw new Error(`Generated parity docs are missing: ${source}`)
}

fs.rmSync(target, { recursive: true, force: true })
fs.mkdirSync(path.dirname(target), { recursive: true })
fs.cpSync(source, target, { recursive: true, force: true })

const generated = path.join(target, 'generated')
const index = path.join(target, 'index.md')
if (!fs.existsSync(generated) || !fs.existsSync(index)) {
  throw new Error('Published parity docs are incomplete.')
}

console.log(`Published parity docs to ${path.relative(root, target)}`)
