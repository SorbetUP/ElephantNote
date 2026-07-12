// ContentState manages Muya's vnode document. Its behavior is assembled from
// small controllers so each concern can be understood and replaced independently.

import enterCtrl from './enterCtrl'
import updateCtrl from './updateCtrl'
import backspaceCtrl from './backspaceCtrl'
import deleteCtrl from './deleteCtrl'
import codeBlockCtrl from './codeBlockCtrl'
import tableBlockCtrl from './tableBlockCtrl'
import tableDragBarCtrl from './tableDragBarCtrl'
import tableSelectCellsCtrl from './tableSelectCellsCtrl'
import coreApi from './core'
import marktextApi from './marktext'
import arrowCtrl from './arrowCtrl'
import pasteCtrl from './pasteCtrl'
import copyCutCtrl from './copyCutCtrl'
import paragraphCtrl from './paragraphCtrl'
import tabCtrl from './tabCtrl'
import formatCtrl from './formatCtrl'
import searchCtrl from './searchCtrl'
import containerCtrl from './containerCtrl'
import htmlBlockCtrl from './htmlBlock'
import clickCtrl from './clickCtrl'
import inputCtrl from './inputCtrl'
import tocCtrl from './tocCtrl'
import emojiCtrl from './emojiCtrl'
import imageCtrl from './imageCtrl'
import linkCtrl from './linkCtrl'
import dragDropCtrl from './dragDropCtrl'
import footnoteCtrl from './footnoteCtrl'
import importMarkdown from '../utils/importMarkdown'

import { initializeContentState } from './stateSetup'
import stateProperties from './stateProperties'
import lifecycle from './lifecycle'
import rendering from './rendering'
import blockFactory from './blockFactory'
import blockQueries from './blockQueries'
import blockRemoval from './blockRemoval'
import blockMutations from './blockMutations'
import blockNavigation from './blockNavigation'

const nativeControllers = [
  stateProperties,
  lifecycle,
  rendering,
  blockFactory,
  blockQueries,
  blockRemoval,
  blockMutations,
  blockNavigation
]

const legacyControllers = [
  coreApi,
  marktextApi,
  tabCtrl,
  enterCtrl,
  updateCtrl,
  backspaceCtrl,
  deleteCtrl,
  codeBlockCtrl,
  arrowCtrl,
  pasteCtrl,
  copyCutCtrl,
  tableBlockCtrl,
  tableDragBarCtrl,
  tableSelectCellsCtrl,
  paragraphCtrl,
  formatCtrl,
  searchCtrl,
  containerCtrl,
  htmlBlockCtrl,
  clickCtrl,
  inputCtrl,
  tocCtrl,
  emojiCtrl,
  imageCtrl,
  linkCtrl,
  dragDropCtrl,
  footnoteCtrl,
  importMarkdown
]

class ContentState {
  constructor(muya, options) {
    initializeContentState(this, muya, options)
  }
}

nativeControllers.forEach((install) => install(ContentState))
legacyControllers.forEach((install) => install(ContentState))

export default ContentState
