import { h } from '../../parser/render/snabbdom'

export const renderImageSelectorHeader = selector => {
  const t = selector.translate
  const tabs = [
    { label: t('editor.image.selector.tab.select'), value: 'select' },
    { label: t('editor.image.selector.tab.embedLink'), value: 'link' }
  ]
  const children = tabs.map(tab => {
    const itemSelector = selector.tab === tab.value ? 'li.active' : 'li'
    return h(
      itemSelector,
      h(
        'span',
        {
          on: {
            click: event => selector.tabClick(event, tab)
          }
        },
        tab.label
      )
    )
  })
  return h('ul.header', children)
}

const createInput = (selector, type, placeholder, value, source = false) => {
  return h(`input.${type}`, {
    props: { placeholder, value },
    on: {
      input: event => selector.inputHandler(event, type),
      paste: event => selector.inputHandler(event, type),
      keydown: event => {
        if (source) selector.srcInputKeyDown(event)
        else selector.handleKeyDown(event)
      },
      ...(source ? { keyup: event => selector.handleKeyUp(event) } : {})
    }
  })
}

export const renderImageSelectorBody = selector => {
  const { tab, state, isFullMode } = selector
  const t = selector.translate
  const { alt, title, src } = state
  let bodyContent = null

  if (tab === 'select') {
    bodyContent = [
      h(
        'button.muya-button.role-button.select',
        { on: { click: () => selector.handleSelectButtonClick() } },
        t('editor.image.selector.select.chooseButton')
      ),
      h('span.description', t('editor.image.selector.select.tip'))
    ]
  } else {
    const altInput = createInput(
      selector,
      'alt',
      t('editor.image.selector.inputs.alt'),
      alt
    )
    const srcInput = createInput(
      selector,
      'src',
      t('editor.image.selector.inputs.src'),
      src,
      true
    )
    const titleInput = createInput(
      selector,
      'title',
      t('editor.image.selector.inputs.title'),
      title
    )
    const inputWrapper = isFullMode
      ? h('div.input-container', [altInput, srcInput, titleInput])
      : h('div.input-container', [srcInput])
    const embedButton = h(
      'button.muya-button.role-button.link',
      { on: { click: () => selector.handleLinkButtonClick() } },
      t('editor.image.selector.embedButton')
    )
    const bottomDescription = h('span.description', [
      h('span', t('editor.image.selector.hint.prefix') + ' '),
      h(
        'a',
        { on: { click: () => selector.toggleMode() } },
        isFullMode
          ? t('editor.image.selector.hint.simple')
          : t('editor.image.selector.hint.full')
      )
    ])
    bodyContent = [inputWrapper, embedButton, bottomDescription]
  }

  return h('div.image-select-body', bodyContent)
}
