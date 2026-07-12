import { handled } from './backspaceResults'

export const handleSelectedImageBackspace = (contentState, event) => {
  if (!contentState.selectedImage) return null
  event.preventDefault()
  return handled(contentState.deleteImage(contentState.selectedImage))
}

export const handleSelectAllBackspace = (contentState, event) => {
  if (!contentState.isSelectAll()) return null
  event.preventDefault()
  contentState.blocks = [contentState.createBlockP()]
  contentState.init()
  contentState.render()
  contentState.muya.dispatchSelectionChange()
  contentState.muya.dispatchSelectionFormats()
  return handled(contentState.muya.dispatchChange())
}
