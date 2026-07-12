import { createWritingTools } from './writingTools'
import { createBasicBlocks, createHeadingBlocks } from './basicAndHeadings'
import { createAdvancedBlocks, createListBlocks } from './advancedAndLists'
import { createDiagramBlocks } from './diagrams'

export const createQuickInsertObj = (t) => {
  const translate = t || ((key) => key)

  return {
    'Writing tools': createWritingTools(),
    [translate('quickInsert.basicBlock')]: createBasicBlocks(translate),
    [translate('quickInsert.header')]: createHeadingBlocks(translate),
    [translate('quickInsert.advancedBlock')]: createAdvancedBlocks(translate),
    [translate('quickInsert.listBlock')]: createListBlocks(translate),
    [translate('quickInsert.diagram')]: createDiagramBlocks(translate)
  }
}

// Maintained for backward compatibility; all call sites use the factory.
