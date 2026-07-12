const DEFAULT_MAX_PASSES = 12

const asMarkdown = (value) => String(value ?? '')

export const stabilizeProgrammaticMarkdown = ({
  markdown = '',
  cursor,
  isRenderCursor = true,
  muyaIndexCursor,
  blocks,
  render,
  readMarkdown,
  readMuyaIndexCursor = () => undefined,
  maxPasses = DEFAULT_MAX_PASSES
} = {}) => {
  if (typeof render !== 'function') {
    throw new TypeError('A Muya render callback is required.')
  }
  if (typeof readMarkdown !== 'function') {
    throw new TypeError('A Muya Markdown reader is required.')
  }

  const limit = Math.max(1, Math.floor(Number(maxPasses) || DEFAULT_MAX_PASSES))
  const seen = new Set()
  let source = asMarkdown(markdown)
  let activeCursor = cursor
  let activeIndexCursor = muyaIndexCursor
  let activeBlocks = blocks
  let result
  let passes = 0

  while (passes < limit) {
    seen.add(source)
    result = render(
      source,
      activeCursor,
      isRenderCursor,
      activeIndexCursor,
      activeBlocks
    )
    passes += 1

    const canonical = asMarkdown(readMarkdown())
    const renderedIndexCursor = readMuyaIndexCursor()
    if (canonical === source) {
      return {
        result,
        markdown: canonical,
        muyaIndexCursor: renderedIndexCursor,
        passes,
        stable: true,
        cycle: false
      }
    }

    if (seen.has(canonical)) {
      return {
        result,
        markdown: canonical,
        muyaIndexCursor: renderedIndexCursor,
        passes,
        stable: false,
        cycle: true
      }
    }

    source = canonical
    activeCursor = undefined
    activeIndexCursor = renderedIndexCursor
    activeBlocks = undefined
  }

  return {
    result,
    markdown: asMarkdown(readMarkdown()),
    muyaIndexCursor: readMuyaIndexCursor(),
    passes,
    stable: false,
    cycle: false
  }
}
