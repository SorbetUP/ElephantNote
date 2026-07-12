import bindClick from './clickBinding'
import bindContextClick from './clickContextBinding'

class ClickEvent {
  constructor(muya) {
    this.muya = muya
    this.clickBinding()
    this.contextClickBingding()
  }

  contextClickBingding() {
    return bindContextClick(this.muya)
  }

  clickBinding() {
    return bindClick(this.muya)
  }
}

export default ClickEvent
