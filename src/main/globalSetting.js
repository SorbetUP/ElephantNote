import path from 'path'
import { app } from 'electron'

if (process.platform === 'darwin' && !app.isPackaged) {
  app.commandLine.appendSwitch('use-mock-keychain')
  app.commandLine.appendSwitch('password-store', 'basic')
}

// Set `__static` path to static files in production / development depending on the environment
global.__static = path
  .join(app.isPackaged ? process.resourcesPath : app.getAppPath(), 'static')
  .replace(/\\/g, '\\\\')
