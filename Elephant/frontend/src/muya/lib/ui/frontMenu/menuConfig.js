import copyIcon from '../../assets/pngicon/copy/2.png'
import newIcon from '../../assets/pngicon/paragraph/2.png'
import deleteIcon from '../../assets/pngicon/delete/2.png'
import turnIcon from '../../assets/pngicon/turninto/2.png'
import { isOsx } from '../../config'

const COMMAND_KEY = isOsx ? '⌘' : '⌃'

export const createMenu = t => {
  const translate = t || (key => key)
  return [
    { icon: copyIcon, label: 'duplicate', text: translate('frontMenu.duplicate'), shortCut: `⇧${COMMAND_KEY}P` },
    { icon: turnIcon, label: 'turnInto', text: translate('frontMenu.turnInto') },
    { icon: newIcon, label: 'new', text: translate('frontMenu.newParagraph'), shortCut: `⇧${COMMAND_KEY}N` },
    { icon: deleteIcon, label: 'delete', text: translate('frontMenu.delete'), shortCut: `⇧${COMMAND_KEY}D` }
  ]
}

export const menu = createMenu()
