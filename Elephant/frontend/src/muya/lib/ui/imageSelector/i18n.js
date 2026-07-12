const IMAGE_SELECTOR_I18N = Object.freeze({
  'editor.image.selector.tab.select': 'Select image',
  'editor.image.selector.tab.embedLink': 'Embed link',
  'editor.image.selector.select.chooseButton': 'Choose image',
  'editor.image.selector.select.tip': 'Choose an image from your device.',
  'editor.image.selector.inputs.alt': 'Alt text',
  'editor.image.selector.inputs.src': 'Image path or URL',
  'editor.image.selector.inputs.title': 'Title',
  'editor.image.selector.embedButton': 'Embed image',
  'editor.image.selector.hint.prefix': 'Need alt text or title?',
  'editor.image.selector.hint.full': 'Show more fields',
  'editor.image.selector.hint.simple': 'Show fewer fields'
})

export default function translateImageSelector(selector, key) {
  const fallback = IMAGE_SELECTOR_I18N[key] || key
  const translate = selector.muya?.options?.t
  if (typeof translate !== 'function') return fallback
  try {
    const value = translate(key)
    return typeof value === 'string' && value && value !== key ? value : fallback
  } catch {
    return fallback
  }
}
