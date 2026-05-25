import path from 'path'
import { nativeImage } from 'electron'
import { isWindows } from '../config'

export const getAppIconPath = () => {
  return path.join(global.__static, isWindows ? 'icon.ico' : 'icon.png')
}

export const getAppDockIcon = () => {
  const image = nativeImage.createFromPath(path.join(global.__static, 'icon.png'))
  return image.isEmpty() ? null : image
}
