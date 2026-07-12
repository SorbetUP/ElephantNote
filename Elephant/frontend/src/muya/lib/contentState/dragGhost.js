import { findNearestParagraph, findOutMostParagraph } from '../selection/dom'
import { verticalPositionInRect } from '../utils'

const GHOST_ID = 'mu-dragover-ghost'
const GHOST_HEIGHT = 3

export const hideGhost = function() {
  this.dropAnchor = null
  const ghost = document.querySelector(`#${GHOST_ID}`)
  if (ghost) ghost.remove()
}

export const createGhost = function(event) {
  const nearestParagraph = findNearestParagraph(event.target)
  const outmostParagraph = findOutMostParagraph(event.target)
  if (!outmostParagraph) return this.hideGhost()

  const block = this.getBlock(nearestParagraph.id)
  let anchor = this.getAnchor(block)
  if (!anchor) anchor = this.getBlock(outmostParagraph.id)
  if (!anchor) return

  const anchorParagraph = this.muya.container.querySelector(`#${anchor.key}`)
  const rect = anchorParagraph.getBoundingClientRect()
  const position = verticalPositionInRect(event, rect)
  this.dropAnchor = { position, anchor }

  let ghost = document.querySelector(`#${GHOST_ID}`)
  if (!ghost) {
    ghost = document.createElement('div')
    ghost.id = GHOST_ID
    document.body.appendChild(ghost)
  }
  Object.assign(ghost.style, {
    width: `${rect.width}px`,
    left: `${rect.left}px`,
    top: position === 'up' ? `${rect.top - GHOST_HEIGHT}px` : `${rect.top + rect.height}px`
  })
}
