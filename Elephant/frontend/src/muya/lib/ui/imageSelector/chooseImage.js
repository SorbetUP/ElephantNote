export const chooseImage = async selector => {
  if (!selector.muya.options.imagePathPicker) {
    console.warn('You need to add a imagePathPicker option')
    return
  }
  const path = await selector.muya.options.imagePathPicker()
  const { alt, title } = selector.state
  return selector.replaceImageAsync({ alt, title, src: path })
}
