import { checkEditLanguage, selectLanguage } from './codeLanguageCursor'
import { updateCodeLanguage } from './codeLanguageUpdate'
import { codeBlockUpdate } from './codeBlockConversion'
import { copyCodeBlock, resizeLineNumber } from './codeBlockClipboard'

const codeBlockCtrl = ContentState => {
  ContentState.prototype.checkEditLanguage = checkEditLanguage
  ContentState.prototype.selectLanguage = selectLanguage
  ContentState.prototype.updateCodeLanguage = updateCodeLanguage
  ContentState.prototype.codeBlockUpdate = codeBlockUpdate
  ContentState.prototype.copyCodeBlock = copyCodeBlock
  ContentState.prototype.resizeLineNumber = resizeLineNumber
}

export default codeBlockCtrl
