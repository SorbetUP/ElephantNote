import { updateBlockQuote } from './updateBlockQuote'
import { updateIndentCode } from './updateIndentCode'
import { updateToParagraph } from './updateToParagraph'

const updateBlocks = ContentState => {
  ContentState.prototype.updateBlockQuote = updateBlockQuote
  ContentState.prototype.updateIndentCode = updateIndentCode
  ContentState.prototype.updateToParagraph = updateToParagraph
}

export default updateBlocks
