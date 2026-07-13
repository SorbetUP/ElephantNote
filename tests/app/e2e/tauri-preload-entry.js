'use strict'

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

require('./tauri-preload')
