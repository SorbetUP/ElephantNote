'use strict'

const fs = require('fs')
const Module = require('module')
const path = require('path')
const { contextBridge } = require('electron')

contextBridge.exposeInMainWorld('process', {
  env: {
    NODE_ENV: 'production',
    PERF_TESTING: process.env.PERF_TESTING || 'true'
  },
  platform: process.platform,
  arch: process.arch,
  type: 'renderer',
  browser: true,
  versions: {
    chrome: process.versions.chrome,
    electron: process.versions.electron,
    node: process.versions.node
  }
})

const fixturePath = path.join(__dirname, 'tauri-preload.js')
const fixtureSource = fs.readFileSync(fixturePath, 'utf8').replace(
  "contextBridge.exposeInMainWorld('__MARKTEXT_RUNTIME__', 'tauri')\n",
  ''
)
const fixtureModule = new Module(fixturePath, module)
fixtureModule.filename = fixturePath
fixtureModule.paths = Module._nodeModulePaths(path.dirname(fixturePath))
fixtureModule._compile(fixtureSource, fixturePath)
