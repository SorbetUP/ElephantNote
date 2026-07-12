import { createQuickInsertObj } from '../quickInsert/config'

const createWholeSubMenu = t => {
  const quickInsertObj = createQuickInsertObj(t)
  return Object.keys(quickInsertObj).reduce((items, key) => {
    return [...items, ...quickInsertObj[key]]
  }, [])
}

export const createGetSubMenu = t => {
  const wholeSubMenu = createWholeSubMenu(t)
  return (block, startBlock, endBlock) => {
    if (block.type === 'p') {
      const filter = startBlock.key === endBlock.key
        ? /front-matter|hr|table/
        : /front-matter|hr|table|heading/
      return wholeSubMenu.filter(item => !filter.test(item.label))
    }
    if (/^h[1-6]$/.test(block.type)) {
      return wholeSubMenu.filter(item => /heading|paragraph/.test(item.label))
    }
    if (/ul|ol/.test(block.type)) {
      return wholeSubMenu.filter(item => /ul|ol/.test(item.label))
    }
    return []
  }
}

export const getSubMenu = createGetSubMenu()
