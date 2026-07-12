import {
  FUNCTION_TYPE_ICON,
  TYPE_ICON,
  paragraphIcon,
  bulletListIcon,
  todoListIcon
} from './iconAssets'

export const resolveBlockIcon = (block, t) => {
  const { type, functionType, listType } = block
  if (type === 'figure' || type === 'pre') {
    const icon = FUNCTION_TYPE_ICON[functionType]
    if (icon) return { icon, isCopyLink: false }
    console.warn(t('editor.unhandledFunctionType', { functionType }))
    return { icon: paragraphIcon, isCopyLink: false }
  }
  if (type === 'ul') {
    return {
      icon: listType === 'task' ? todoListIcon : bulletListIcon,
      isCopyLink: false
    }
  }
  return {
    icon: TYPE_ICON[type] || paragraphIcon,
    isCopyLink: /^h[1-6]$/.test(type)
  }
}
