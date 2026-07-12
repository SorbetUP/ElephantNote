import defaultOptions from './options'
import { blockRendererMethods } from './rendererBlocks'
import { tableRendererMethods } from './rendererTables'
import { inlineRendererMethods } from './rendererInline'

function Renderer(options = {}) {
  this.options = options || defaultOptions
}

Object.assign(
  Renderer.prototype,
  blockRendererMethods,
  tableRendererMethods,
  inlineRendererMethods
)

export default Renderer
