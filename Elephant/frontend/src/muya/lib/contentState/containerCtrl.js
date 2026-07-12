import {
  createContainerBlock,
  initContainerBlock
} from './containerCreation'
import { handleContainerBlockClick } from './containerInteraction'
import { updateMathBlock } from './containerMathUpdate'
import { createPreAndPreview } from './containerPrePreview'

const containerCtrl = ContentState => {
  ContentState.prototype.createContainerBlock = createContainerBlock
  ContentState.prototype.createPreAndPreview = createPreAndPreview
  ContentState.prototype.initContainerBlock = initContainerBlock
  ContentState.prototype.handleContainerBlockClick = handleContainerBlockClick
  ContentState.prototype.updateMathBlock = updateMathBlock
}

export default containerCtrl
