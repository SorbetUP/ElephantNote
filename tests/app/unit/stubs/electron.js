const noop = () => {}
const asyncUndefined = async() => undefined

export const app = {
  getAppPath: () => '',
  getName: () => 'Elephant',
  getPath: () => '',
  getVersion: () => '0.0.0-test',
  isPackaged: false,
  on: noop,
  once: noop,
  quit: noop,
  whenReady: async() => undefined
}

export const BrowserWindow = {
  fromWebContents: () => null,
  getAllWindows: () => []
}

export const dialog = {
  showErrorBox: noop,
  showMessageBox: async() => ({ response: 0 }),
  showOpenDialog: async() => ({ canceled: true, filePaths: [] }),
  showSaveDialog: async() => ({ canceled: true, filePath: '' })
}

export const ipcMain = {
  handle: noop,
  handleOnce: noop,
  on: noop,
  once: noop,
  removeAllListeners: noop,
  removeHandler: noop
}

export const ipcRenderer = {
  invoke: asyncUndefined,
  on: noop,
  once: noop,
  removeAllListeners: noop,
  removeListener: noop,
  send: noop,
  sendSync: () => undefined
}

export const nativeTheme = {
  shouldUseDarkColors: false,
  themeSource: 'system'
}

export const shell = {
  openExternal: asyncUndefined,
  openPath: async() => ''
}

export default {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  ipcRenderer,
  nativeTheme,
  shell
}
