import { spawn } from 'node:child_process'
import fs from 'node:fs'

const reportPath = 'eslint-output.txt'
const child = spawn('pnpm', ['exec', 'electron-vite', 'build'], {
  stdio: ['ignore', 'pipe', 'pipe'],
  shell: process.platform === 'win32'
})

let output = '\n\n===== Electron reference build output =====\n'

const capture = (chunk, stream) => {
  const text = chunk.toString()
  output += text
  stream.write(text)
}

child.stdout.on('data', (chunk) => capture(chunk, process.stdout))
child.stderr.on('data', (chunk) => capture(chunk, process.stderr))
child.on('error', (error) => {
  output += `\n[build-wrapper-error] ${error.stack || error.message}\n`
  fs.appendFileSync(reportPath, output)
  process.exit(1)
})
child.on('close', (code) => {
  output += `\n[build-wrapper-exit] code=${code}\n`
  fs.appendFileSync(reportPath, output)
  process.exit(code ?? 1)
})
