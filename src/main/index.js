import './globalSetting'
import path from 'path'
import { app, dialog, crashReporter } from 'electron'
import log from 'electron-log'
import { electronApp, optimizer } from '@electron-toolkit/utils'
import { initialize as remoteInitializeServer } from '@electron/remote/main'

import cli from './cli'
import setupExceptionHandler, { initExceptionLogger } from './exceptionHandler'
import setupEnvironment from './app/env'
import { getLogLevel } from './utils'
import Accessor from './app/accessor'
import App from './app'
import { APP_NAME } from './app/metadata'
import { t } from './i18n'
import { registerElephantNoteIpc } from 'elephant-back/vaults'
import { installLlamaWarningFilter } from './llamaWarningFilter'

installLlamaWarningFilter()

process.title = APP_NAME
app.setName(APP_NAME)
app.setAboutPanelOptions({
  applicationName: APP_NAME
})

// Set version strings into global and process.versions
process.env.MARKTEXT_VERSION = MARKTEXT_VERSION
process.env.MARKTEXT_VERSION_STRING = MARKTEXT_VERSION_STRING

// -----------------------------------------------
// Exception handling and logging setup
setupExceptionHandler()
const args = cli()
const appEnvironment = setupEnvironment(args)

const initializeLogger = (env) => {
  log.initialize() // allows listening for logs from the renderer process
  log.transports.console.level = process.env.NODE_ENV === 'development' ? 'info' : 'error'
  log.transports.file.level = process.env.NODE_ENV === 'development' ? 'info' : getLogLevel()
  let isQuitting = false
  const defaultConsoleWriteFn = log.transports.console.writeFn.bind(log.transports.console)
  const isClosedStdioError = err => ['EPIPE', 'EIO', 'ERR_STREAM_DESTROYED'].includes(err?.code)

  log.transports.console.writeFn = (options) => {
    if (isQuitting || process.stdout.destroyed || process.stderr.destroyed) {
      return
    }

    try {
      defaultConsoleWriteFn(options)
    } catch (err) {
      if (!isClosedStdioError(err)) {
        throw err
      }
    }
  }
  app.once('before-quit', () => {
    isQuitting = true
    log.transports.console.writeFn = () => {}
  })
  log.transports.file.resolvePathFn = (variables) => {
    if (variables.browserWindow && variables.browserWindow.id) {
      return path.join(env.paths.logPath, `renderer-${variables.browserWindow.id}.log`)
    }
    return path.join(env.paths.logPath, 'main.log')
  }
  log.transports.file.level = getLogLevel()
  log.transports.file.sync = true
  log.errorHandler.startCatching({
    onError(error) {
      // This callback receives the full Error object with stack
      log.error('Uncaught Exception:', error.stack)
    }
  })
  initExceptionLogger()
}

initializeLogger(appEnvironment)
log.info(`[boot] ${APP_NAME} starting`, {
  version: process.env.MARKTEXT_VERSION_STRING,
  node: process.version,
  platform: process.platform
})
log.info('[boot] logger initialized')

// Handles native level crashes
crashReporter.start({
  companyName: '',
  productName: APP_NAME,
  uploadToServer: false, // collect locally
  compress: true
})
process.on('uncaughtException', (err) => {
  log.error('Main uncaughtException:', err.stack)
})
process.on('unhandledRejection', (reason) => {
  log.error('Main unhandledRejection:', reason)
})

// -----------------------------------------------
// Disable GPU if requested
if (args['--disable-gpu']) {
  app.disableHardwareAcceleration()
}

// Single instance lock (except macOS & development)
if (!process.mas && process.env.NODE_ENV !== 'development') {
  const gotLock = app.requestSingleInstanceLock()
  if (!gotLock) {
    process.stdout.write(t('error.otherInstanceDetected'))
    process.exit(0)
  }
}

// Enable remote module for windows
remoteInitializeServer()

// Windows-specific AppUserModelID
electronApp.setAppUserModelId('com.elephantnote.app')

// Dev shortcuts and reload suppression
app.on('browser-window-created', (_, window) => {
  optimizer.watchWindowShortcuts(window)
})
app.whenReady().then(() => {
  process.title = APP_NAME
  app.setName(APP_NAME)
  app.setAboutPanelOptions({
    applicationName: APP_NAME
  })
})

// Instantiate and start the main App controller
let accessor
try {
  accessor = new Accessor(appEnvironment)
} catch (err) {
  const msgHint = err.message.includes('Config schema violation')
    ? t('error.configSchemaViolation')
    : ''
  log.error(t('error.initializationFailed', { hint: msgHint }), err)

  const EXIT_ON_ERROR = !!process.env.MARKTEXT_EXIT_ON_ERROR
  const SHOW_ERROR_DIALOG = !process.env.MARKTEXT_ERROR_INTERACTION
  if (!EXIT_ON_ERROR && SHOW_ERROR_DIALOG) {
    dialog.showErrorBox(t('error.startupError'), `${msgHint}${err.message}\n\n${err.stack}`)
  }
  process.exit(1)
}
const appController = new App(accessor, args)
registerElephantNoteIpc()
log.info('[boot] IPC handlers registered')
appController.init()
log.info('[boot] app controller initialized')

// Quit when all windows are closed (except on macOS)
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
