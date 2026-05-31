import { contextBridge, shell, clipboard, webUtils } from 'electron'
import fs from 'fs-extra'
import { isFile, isDirectory, ensureDirSync } from 'common/filesystem'
import { electronAPI } from '@electron-toolkit/preload'
import {
  isChildOfDirectory,
  hasMarkdownExtension,
  MARKDOWN_INCLUSIONS,
  isSamePathSync,
  isImageFile
} from 'common/filesystem/paths'
import { rgPath } from '@vscode/ripgrep'
import path from 'path'
import commandExists from 'command-exists'
import { loadTranslations } from 'common/i18n'

const i18nUtils = {
  loadTranslations
}

const customElectronAPI = {
  shell,
  clipboard,
  webUtils
}

const fileUtilsAPI = {
  isFile: (path) => isFile(path),
  isDirectory: (path) => isDirectory(path),
  emptyDir: (path) => fs.emptyDir(path),
  copy: (src, dest) => fs.copy(src, dest),
  ensureDir: (path) => fs.ensureDir(path),
  outputFile: (path, data) => fs.outputFile(path, data),
  move: (src, dest) => fs.move(src, dest),
  stat: (path) => fs.stat(path),
  writeFile: (path, data) => fs.writeFile(path, data),
  readFile: (path) => fs.readFile(path),
  ensureDirSync: (path) => ensureDirSync(path),
  pathExistsSync: (path) => fs.pathExistsSync(path),
  isChildOfDirectory: (dir, child) => isChildOfDirectory(dir, child),
  hasMarkdownExtension: (filename) => hasMarkdownExtension(filename),
  MARKDOWN_INCLUSIONS,
  isSamePathSync: (pathA, pathB) => isSamePathSync(pathA, pathB),
  isImageFile: (filepath) => isImageFile(filepath)
}

const commandAPI = {
  exists: (command) => {
    try {
      // First attempt to check using command-exists
      if (commandExists.sync(command)) {
        return true
      }

      // For picgo, additionally check common installation paths
      if (command === 'picgo' && process.platform === 'darwin') {
        const commonPaths = [
          '/usr/local/bin/picgo',
          '/opt/homebrew/bin/picgo',
          `${process.env.HOME}/.npm-global/bin/picgo`,
          `${process.env.HOME}/.npm/bin/picgo`,
          '/usr/local/lib/node_modules/.bin/picgo'
        ]

        for (const picgoPath of commonPaths) {
          if (fs.pathExistsSync(picgoPath)) {
            console.log(`Found picgo at: ${picgoPath}`)
            return true
          }
        }
      }

      return false
    } catch (error) {
      console.error('Error checking command existence:', error)
      return false
    }
  }
}

const elephantNoteAPI = {
  api: {
    describe: () => electronAPI.ipcRenderer.invoke('elephantnote:api:describe'),
    call: (action, payload = {}) =>
      electronAPI.ipcRenderer.invoke('elephantnote:api:call', { action, payload })
  },
  getVaults: () => electronAPI.ipcRenderer.invoke('elephantnote:getVaults'),
  selectVault: () => electronAPI.ipcRenderer.invoke('elephantnote:selectVault'),
  setActiveVault: (vaultId) => electronAPI.ipcRenderer.invoke('elephantnote:setActiveVault', vaultId),
  setVaultIcon: (payload) => electronAPI.ipcRenderer.invoke('elephantnote:setVaultIcon', payload),
  setVaultName: (payload) => electronAPI.ipcRenderer.invoke('elephantnote:setVaultName', payload),
  removeVault: (payload) => electronAPI.ipcRenderer.invoke('elephantnote:removeVault', payload),
  listDirectory: (relativePath) =>
    electronAPI.ipcRenderer.invoke('elephantnote:listDirectory', relativePath),
  createNote: (payload) => electronAPI.ipcRenderer.invoke('elephantnote:createNote', payload),
  createFolder: (payload) => electronAPI.ipcRenderer.invoke('elephantnote:createFolder', payload),
  attachSidebarEntry: (payload) =>
    electronAPI.ipcRenderer.invoke('elephantnote:attachSidebarEntry', payload),
  detachSidebarEntry: (payload) =>
    electronAPI.ipcRenderer.invoke('elephantnote:detachSidebarEntry', payload),
  importGoogleKeep: () => electronAPI.ipcRenderer.invoke('elephantnote:importGoogleKeep'),
  renameEntry: (payload) => electronAPI.ipcRenderer.invoke('elephantnote:renameEntry', payload),
  moveEntry: (payload) => electronAPI.ipcRenderer.invoke('elephantnote:moveEntry', payload),
  deleteEntry: (payload) => electronAPI.ipcRenderer.invoke('elephantnote:deleteEntry', payload),
  search: {
    initVault: (vaultPath) => electronAPI.ipcRenderer.invoke('en:search:init-vault', vaultPath),
    query: (params) => electronAPI.ipcRenderer.invoke('en:search:query', params),
    status: () => electronAPI.ipcRenderer.invoke('en:search:status'),
    inspect: () => electronAPI.ipcRenderer.invoke('en:search:inspect'),
    rebuild: () => electronAPI.ipcRenderer.invoke('en:search:rebuild'),
    clear: () => electronAPI.ipcRenderer.invoke('en:search:clear'),
    disable: () => electronAPI.ipcRenderer.invoke('en:search:disable'),
    enable: () => electronAPI.ipcRenderer.invoke('en:search:enable')
  },
  sitePreview: {
    previewFolder: (params) => electronAPI.ipcRenderer.invoke('en:site-preview:preview-folder', params),
    buildFolder: (params) => electronAPI.ipcRenderer.invoke('en:site-preview:build-folder', params),
    stop: (siteId) => electronAPI.ipcRenderer.invoke('en:site-preview:stop', siteId),
    status: (siteId) => electronAPI.ipcRenderer.invoke('en:site-preview:status', siteId),
    openExternal: (url) => electronAPI.ipcRenderer.invoke('en:site-preview:open-external', url)
  },
  agents: {
    list: () => electronAPI.ipcRenderer.invoke('en:agents:list'),
    register: (payload) => electronAPI.ipcRenderer.invoke('en:agents:register', payload),
    unregister: (id) => electronAPI.ipcRenderer.invoke('en:agents:unregister', id),
    send: (payload) => electronAPI.ipcRenderer.invoke('en:agents:send', payload)
  }
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', {
      ...electronAPI,
      ...customElectronAPI
    })
    contextBridge.exposeInMainWorld('rgPath', rgPath)
    contextBridge.exposeInMainWorld('fileUtils', fileUtilsAPI)
    contextBridge.exposeInMainWorld('path', path)
    contextBridge.exposeInMainWorld('commandExists', commandAPI)
    contextBridge.exposeInMainWorld('i18nUtils', i18nUtils)
    contextBridge.exposeInMainWorld('elephantnote', elephantNoteAPI)
  } catch (error) {
    console.error(error)
  }
} else {
  window.electron = { ...electronAPI, ...customElectronAPI }
  window.rgPath = rgPath
  window.fileUtils = fileUtilsAPI
  window.path = path
  window.commandExists = commandAPI
  window.i18nUtils = i18nUtils
  window.elephantnote = elephantNoteAPI
}
