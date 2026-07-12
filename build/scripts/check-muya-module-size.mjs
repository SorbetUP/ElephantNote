import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const muyaRoot = path.join(root, 'Elephant/frontend/src/muya')
const limit = Number(process.env.MUYA_MAX_LINES || 200)

const walk = (directory) => fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
  const absolute = path.join(directory, entry.name)
  if (entry.isDirectory()) return walk(absolute)
  return entry.isFile() && /\.(?:js|mjs|cjs)$/.test(entry.name) ? [absolute] : []
})

const countLines = (file) => {
  const content = fs.readFileSync(file, 'utf8')
  if (!content) return 0
  return content.split(/\r?\n/).length
}

const files = walk(muyaRoot)
const offenders = files
  .map((file) => ({
    file: path.relative(root, file),
    lines: countLines(file)
  }))
  .filter(({ lines }) => lines > limit)
  .sort((left, right) => right.lines - left.lines || left.file.localeCompare(right.file))

console.log(`Muya JavaScript modules: ${files.length}`)
console.log(`Maximum allowed lines: ${limit}`)

if (!offenders.length) {
  console.log('All Muya JavaScript modules respect the size limit.')
  process.exit(0)
}

console.error(`${offenders.length} Muya modules exceed ${limit} lines:`)
for (const { file, lines } of offenders) console.error(`${String(lines).padStart(5)}  ${file}`)
process.exit(1)
