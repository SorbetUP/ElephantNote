import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const args = process.argv.slice(2)
const valueFor = (name) => {
  const exactIndex = args.indexOf(name)
  if (exactIndex >= 0) return args[exactIndex + 1] || null
  const prefix = `${name}=`
  const value = args.find((arg) => arg.startsWith(prefix))
  return value ? value.slice(prefix.length) : null
}

const run = (command, commandArgs, options = {}) => {
  const result = spawnSync(command, commandArgs, {
    cwd: root,
    encoding: options.encoding || 'utf8',
    env: options.env || process.env,
    input: options.input,
    stdio: options.stdio || ['ignore', 'pipe', 'pipe'],
    maxBuffer: 64 * 1024 * 1024
  })
  if (result.error) throw result.error
  if (result.status !== 0 && !options.allowFailure) {
    const stderr = typeof result.stderr === 'string' ? result.stderr : ''
    throw new Error(`${command} ${commandArgs.join(' ')} failed (${result.status}):\n${stderr}`)
  }
  return result
}

const gitText = (...gitArgs) => run('git', gitArgs).stdout.trim()

const resolveReferenceRef = () => {
  const explicit = valueFor('--reference-ref') || process.env.MUYA_REFERENCE_REF
  if (explicit) return gitText('rev-parse', '--verify', explicit)

  const remoteDevelop = run('git', ['rev-parse', '--verify', 'origin/develop'], { allowFailure: true })
  if (remoteDevelop.status === 0) {
    return gitText('merge-base', 'HEAD', 'origin/develop')
  }
  return gitText('rev-parse', 'HEAD^')
}

const referenceRef = resolveReferenceRef()
const candidateRef = gitText('rev-parse', 'HEAD')
const candidateRoot = path.join(root, 'Elephant/frontend/src/muya')
const referenceRoot = path.join(root, 'Elephant/frontend/src/.muya-characterization-reference')
const outputRoot = path.join(root, 'build/muya-characterization')
const configPath = path.join(root, 'tests/app/characterization/vitest.config.mjs')
const vitestPath = path.join(root, 'Elephant/node_modules/vitest/vitest.mjs')
const keepReference = args.includes('--keep-reference') || process.env.MUYA_KEEP_REFERENCE === '1'

const extractReference = () => {
  fs.rmSync(referenceRoot, { recursive: true, force: true })
  fs.mkdirSync(referenceRoot, { recursive: true })
  const archive = run('git', ['archive', referenceRef, 'Elephant/frontend/src/muya'], {
    encoding: 'buffer'
  }).stdout
  run('tar', ['-xf', '-', '-C', referenceRoot, '--strip-components=4'], {
    encoding: 'buffer',
    input: archive
  })
  const entry = path.join(referenceRoot, 'lib/index.js')
  if (!fs.existsSync(entry)) throw new Error(`Reference Muya entry was not extracted: ${entry}`)
}

const writeMetadata = () => {
  fs.rmSync(outputRoot, { recursive: true, force: true })
  fs.mkdirSync(outputRoot, { recursive: true })
  const metadata = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    referenceRef,
    candidateRef,
    referenceRoot: path.relative(root, referenceRoot),
    candidateRoot: path.relative(root, candidateRoot)
  }
  fs.writeFileSync(path.join(outputRoot, 'metadata.json'), `${JSON.stringify(metadata, null, 2)}\n`)
}

const main = () => {
  if (!fs.existsSync(vitestPath)) {
    throw new Error(`Vitest is not installed at ${vitestPath}. Run pnpm install first.`)
  }

  extractReference()
  writeMetadata()
  console.log(`Muya reference: ${referenceRef}`)
  console.log(`Muya candidate: ${candidateRef}`)

  const result = run(process.execPath, [vitestPath, 'run', '--config', configPath], {
    allowFailure: true,
    stdio: 'inherit',
    env: {
      ...process.env,
      NODE_PATH: path.join(root, 'Elephant/node_modules'),
      MUYA_REFERENCE_ROOT: referenceRoot,
      MUYA_CANDIDATE_ROOT: candidateRoot,
      MUYA_CHARACTERIZATION_OUTPUT: outputRoot,
      MUYA_REFERENCE_REF: referenceRef,
      MUYA_CANDIDATE_REF: candidateRef
    }
  })

  if (result.status !== 0) {
    throw new Error(`Muya characterization parity failed with status ${result.status}.`)
  }
  console.log(`Muya characterization parity passed. Results: ${path.relative(root, outputRoot)}`)
}

try {
  main()
} catch (error) {
  console.error(error.message)
  process.exitCode = 1
} finally {
  if (!keepReference) fs.rmSync(referenceRoot, { recursive: true, force: true })
}
