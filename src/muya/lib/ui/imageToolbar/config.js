import editIcon from '../../assets/pngicon/imageEdit/2.png'
import inlineIcon from '../../assets/pngicon/inline_image/2.png'
import leftIcon from '../../assets/pngicon/algin_left/2.png'
import middleIcon from '../../assets/pngicon/algin_center/2.png'
import rightIcon from '../../assets/pngicon/algin_right/2.png'
import deleteIcon from '../../assets/pngicon/image_delete/2.png'

const excalidrawIcon = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA2NCA2NCI+PHJlY3Qgd2lkdGg9IjY0IiBoZWlnaHQ9IjY0IiByeD0iMTgiIGZpbGw9IiM2QzYzRkYiLz48cGF0aCBkPSJNMjAgNDRjNy41LTE1LjUgMTUuNS0yMy41IDI0LTI0IiBmaWxsPSJub25lIiBzdHJva2U9IiNmZmYiIHN0cm9rZS13aWR0aD0iNSIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIi8+PHBhdGggZD0iTTE4IDQ2bDgtMi02LTYtMiA4eiIgZmlsbD0iI2ZmZiIvPjxwYXRoIGQ9Ik00MiAxOGw0IDQiIHN0cm9rZT0iI2ZmZiIgc3Ryb2tlLXdpZHRoPSI1IiBzdHJva2UtbGluZWNhcD0icm91bmQiLz48Y2lyY2xlIGN4PSIyMiIgY3k9IjIyIiByPSI0IiBmaWxsPSIjZmZmIiBvcGFjaXR5PSIuODUiLz48cGF0aCBkPSJNNDIgNDJoNyIgc3Ryb2tlPSIjZmZmIiBzdHJva2Utd2lkdGg9IjQiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgb3BhY2l0eT0iLjg1Ii8+PC9zdmc+'

export const getIcons = (translateFn) => {
  const t = typeof translateFn === 'function' ? translateFn : (k) => k
  return [
    { type: 'edit', tooltip: t('editor.image.toolbar.edit'), icon: editIcon },
    { type: 'edit-excalidraw', tooltip: 'Excalidraw', icon: excalidrawIcon, localOnly: true },
    { type: 'inline', tooltip: t('editor.image.toolbar.inline'), icon: inlineIcon },
    { type: 'left', tooltip: t('editor.image.toolbar.alignLeft'), icon: leftIcon },
    { type: 'center', tooltip: t('editor.image.toolbar.alignCenter'), icon: middleIcon },
    { type: 'right', tooltip: t('editor.image.toolbar.alignRight'), icon: rightIcon },
    { type: 'delete', tooltip: t('editor.image.toolbar.delete'), icon: deleteIcon }
  ]
}

export default getIcons
