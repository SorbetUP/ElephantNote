import { createGhost, hideGhost } from './dragGhost'
import { dragleaveHandler, dragoverHandler } from './dragOverHandlers'
import { dropHandler } from './dropHandler'

const dragDropCtrl = ContentState => {
  ContentState.prototype.hideGhost = hideGhost
  ContentState.prototype.createGhost = createGhost
  ContentState.prototype.dragoverHandler = dragoverHandler
  ContentState.prototype.dragleaveHandler = dragleaveHandler
  ContentState.prototype.dropHandler = dropHandler
}

export default dragDropCtrl
