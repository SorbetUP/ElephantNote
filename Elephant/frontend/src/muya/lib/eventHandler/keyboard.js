import {
  listenKeyboardFloats,
  hideAllFloatTools as hideKeyboardFloats
} from './keyboardFloatState'
import {
  languageInputFor as findLanguageInput,
  commitLanguageInput as commitLanguageDraft
} from './keyboardLanguageInput'
import bindKeyboardComposition from './keyboardCompositionBinding'
import {
  bindEditorStateDispatch,
  bindKeyboardKeyup
} from './keyboardSelectionBindings'
import bindKeyboardKeydown from './keyboardKeydownBinding'
import bindKeyboardInput from './keyboardInputBinding'

class Keyboard {
  constructor(muya) {
    this.muya = muya
    this.isComposed = false
    this.shownFloat = {}
    this.recordIsComposed()
    this.dispatchEditorState()
    this.keydownBinding()
    this.keyupBinding()
    this.inputBinding()
    this.listen()
  }

  listen() {
    return listenKeyboardFloats(this)
  }

  hideAllFloatTools() {
    return hideKeyboardFloats(this)
  }

  languageInputFor(target) {
    return findLanguageInput(target)
  }

  commitLanguageInput(element) {
    return commitLanguageDraft(this, element)
  }

  recordIsComposed() {
    return bindKeyboardComposition(this)
  }

  dispatchEditorState() {
    return bindEditorStateDispatch(this)
  }

  keydownBinding() {
    return bindKeyboardKeydown(this)
  }

  inputBinding() {
    return bindKeyboardInput(this)
  }

  keyupBinding() {
    return bindKeyboardKeyup(this)
  }
}

export default Keyboard
