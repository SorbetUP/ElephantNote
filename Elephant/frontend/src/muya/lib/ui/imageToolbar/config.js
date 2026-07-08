import editIcon from '../../assets/pngicon/imageEdit/2.png'
import inlineIcon from '../../assets/pngicon/inline_image/2.png'
import leftIcon from '../../assets/pngicon/algin_left/2.png'
import middleIcon from '../../assets/pngicon/algin_center/2.png'
import rightIcon from '../../assets/pngicon/algin_right/2.png'
import deleteIcon from '../../assets/pngicon/image_delete/2.png'

// Transparent, monochrome Excalidraw mark. Keeping the icon as a data URL lets the
// legacy Muya image toolbar render it without introducing a second icon runtime.
const excalidrawIcon = `data:image/svg+xml,${encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <g fill="none" stroke="#8b7cf6" stroke-width="5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M18 48 45 21l5 5-27 27-9 2 4-7Z"/>
    <path d="m39 16 9 9"/>
    <path d="M20 17 47 44"/>
    <path d="m43 48 5-5 3 9-9-3Z"/>
  </g>
</svg>`)} `

export const getIcons = (translateFn) => {
  const t = typeof translateFn === 'function' ? translateFn : (k) => k
  return [
    { type: 'edit', tooltip: t('editor.image.toolbar.edit'), icon: editIcon },
    { type: 'edit-excalidraw', tooltip: t('excalidraw.title'), icon: excalidrawIcon, localOnly: true },
    { type: 'inline', tooltip: t('editor.image.toolbar.inline'), icon: inlineIcon },
    { type: 'left', tooltip: t('editor.image.toolbar.alignLeft'), icon: leftIcon },
    { type: 'center', tooltip: t('editor.image.toolbar.alignCenter'), icon: middleIcon },
    { type: 'right', tooltip: t('editor.image.toolbar.alignRight'), icon: rightIcon },
    { type: 'delete', tooltip: t('editor.image.toolbar.delete'), icon: deleteIcon }
  ]
}

export default getIcons
