'use strict'

const path = require('node:path')
const { app, BrowserWindow } = require('electron')

app.commandLine.appendSwitch('disable-gpu')
app.commandLine.appendSwitch('disable-software-rasterizer')
app.commandLine.appendSwitch('no-sandbox')

let mainWindow = null

const createWindow = async () => {
  mainWindow = new BrowserWindow({
    width: 1366,
    height: 900,
    minWidth: 960,
    minHeight: 640,
    show: true,
    backgroundColor: '#f5f5f4',
    webPreferences: {
      preload: path.join(__dirname, 'tauri-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  const rendererUrl = process.env.ELEPHANT_E2E_RENDERER_URL
  if (!rendererUrl) throw new Error('ELEPHANT_E2E_RENDERER_URL is required')
  await mainWindow.loadURL(rendererUrl)
  mainWindow.show()
}

app.whenReady().then(createWindow).catch((error) => {
  console.error('[linux-usage-main] unable to create window', error)
  app.exit(1)
})

app.on('window-all-closed', () => app.quit())
