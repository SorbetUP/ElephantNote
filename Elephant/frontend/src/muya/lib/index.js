import { initializeMuya } from './core/setup'
import lifecycle from './core/lifecycle'
import markdown from './core/markdown'
import selection from './core/selection'
import commands from './core/commands'
import historyClipboard from './core/historyClipboard'
import options from './core/options'
import events from './core/events'
import './assets/styles/index.css'

const controllers = [
  lifecycle,
  markdown,
  selection,
  commands,
  historyClipboard,
  options,
  events
]

class Muya {
  static plugins = []

  static use(plugin, options = {}) {
    this.plugins.push({ plugin, options })
  }

  constructor(container, options) {
    initializeMuya(this, Muya, container, options)
  }
}

controllers.forEach((install) => install(Muya))

export default Muya
