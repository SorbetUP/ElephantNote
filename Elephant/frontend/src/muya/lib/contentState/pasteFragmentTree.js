import { HAS_TEXT_BLOCK_REG } from '../config'

export const getLastBlock = blocks => {
  const lastBlock = blocks[blocks.length - 1]
  if (lastBlock.children.length === 0 && HAS_TEXT_BLOCK_REG.test(lastBlock.type)) return lastBlock
  if (lastBlock.editable === false) return getLastBlock(blocks[blocks.length - 2].children)
  return getLastBlock(lastBlock.children)
}
