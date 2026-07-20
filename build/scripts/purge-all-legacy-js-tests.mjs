#!/usr/bin/env node

import { existsSync, readdirSync, rmSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

const root = resolve(import.meta.dirname, '../..')
const testsRoot = join(root, 'tests')
const keepRoots = [
  join(testsRoot, 'trust')
]
const isKept = (path) => keepRoots.some((rootPath) => path === rootPath || path.startsWith(`${rootPath}/`))
const isLegacyTest = (path) => /\.(?:spec|test)\.[cm]?[jt]sx?$/.test(path)
const removed = []

const walk = (directory) => {
  if (!existsSync(directory) || isKept(directory)) return
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry)
    const stats = statSync(path)
    if (stats.isDirectory()) walk(path)
    else if (isLegacyTest(path)) {
      rmSync(path, { force: true })
      removed.push(relative(root, path).replaceAll('\\', '/'))
    }
  }
}

walk(testsRoot)

for (const relativePath of [
  'tests/app/e2e',
  'tests/app/usage',
  'tests/app/unit',
  'tests/elephant/unit'
]) {
  const path = join(root, relativePath)
  if (existsSync(path)) rmSync(path, { recursive: true, force: true })
}

console.log(`[purge-legacy-tests] removed=${removed.length}`)
for (const path of removed) console.log(`[purge-legacy-tests] removed ${path}`)
