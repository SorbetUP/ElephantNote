export const listenKeyboardFloats = keyboard => {
  keyboard.muya.eventCenter.subscribe('muya-float', (tool, status) => {
    if (status) keyboard.shownFloat[tool.name] = tool
    else delete keyboard.shownFloat[tool.name]

    if (tool.name === 'ag-front-menu' && !status) {
      const selectedParagraph = keyboard.muya.container.querySelector('.ag-selected')
      if (selectedParagraph) {
        keyboard.muya.contentState.selectedBlock = null
        selectedParagraph.classList.toggle('ag-selected')
      }
    }
  })
}

export const hideAllFloatTools = keyboard => {
  for (const tool in keyboard.shownFloat) keyboard.shownFloat[tool].hide()
}
