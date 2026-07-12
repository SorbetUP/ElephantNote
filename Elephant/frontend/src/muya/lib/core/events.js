export default (Muya) => {
  Object.assign(Muya.prototype, {
    on(event, listener) {
      this.eventCenter.subscribe(event, listener)
    },

    off(event, listener) {
      this.eventCenter.unsubscribe(event, listener)
    },

    once(event, listener) {
      this.eventCenter.subscribeOnce(event, listener)
    },

    invalidateImageCache() {
      this.contentState.stateRender.invalidateImageCache()
      this.contentState.render(true)
    },

    hideAllFloatTools() {
      return this.keyboard.hideAllFloatTools()
    }
  })
}
