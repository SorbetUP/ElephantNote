export const normalizeParagraphText = (block, indent) => {
  const lines = block.text.split('\n')
  return lines.map(line => `${indent}${line}`).join('\n') + '\n'
}

export const normalizeHeaderText = (block, indent) => {
  const { headingStyle, marker } = block
  const { text } = block.children[0]
  if (headingStyle === 'atx') {
    const match = text.match(/^ {0,3}(#{1,6})(.*)$/)
    if (!match) {
      console.warn('normalizeHeaderText: ATX heading regex did not match:', text)
      return `${indent}${text}\n`
    }
    return `${indent}${match[1]} ${match[2].trim()}\n`
  }
  if (headingStyle === 'setext') {
    const lines = text.trim().split('\n')
    return lines.map(line => `${indent}${line}`).join('\n') + `\n${indent}${marker.trim()}\n`
  }
}

export const normalizeBlockquote = (exporter, block, indent) => {
  return exporter.translateBlocks2Markdown(block.children, `${indent}> `)
}

export const normalizeFrontMatter = block => {
  let startToken
  let endToken
  switch (block.lang) {
    case 'yaml':
      startToken = '---\n'
      endToken = '---\n'
      break
    case 'toml':
      startToken = '+++\n'
      endToken = '+++\n'
      break
    case 'json':
      if (block.style === ';') {
        startToken = ';;;\n'
        endToken = ';;;\n'
      } else {
        startToken = '{\n'
        endToken = '}\n'
      }
      break
  }
  const result = [startToken]
  for (const line of block.children[0].children) result.push(`${line.text}\n`)
  result.push(endToken)
  return result.join('')
}

export const normalizeMultipleMath = (exporter, block, indent) => {
  let startToken = '$$'
  let endToken = '$$'
  if (exporter.isGitlabCompatibilityEnabled && block.mathStyle === 'gitlab') {
    startToken = '```math'
    endToken = '```'
  }
  const result = [`${indent}${startToken}\n`]
  for (const line of block.children[0].children[0].children) {
    result.push(`${indent}${line.text}\n`)
  }
  result.push(`${indent}${endToken}\n`)
  return result.join('')
}

export const normalizeContainer = block => {
  const result = []
  const diagramType = block.children[0].functionType
  result.push('```' + diagramType + '\n')
  for (const line of block.children[0].children[0].children) {
    result.push(`${line.text}\n`)
  }
  result.push('```\n')
  return result.join('')
}

export const normalizeCodeBlock = (block, indent) => {
  const result = []
  const codeContent = block.children[1].children[0]
  const textList = codeContent.text.split('\n')
  if (block.functionType === 'fencecode') {
    result.push(`${indent}${block.lang ? '```' + block.lang + '\n' : '```\n'}`)
    textList.forEach(text => result.push(`${indent}${text}\n`))
    result.push(indent + '```\n')
  } else {
    textList.forEach(text => result.push(`${indent}    ${text}\n`))
  }
  return result.join('')
}

export const normalizeHTML = (block, indent) => {
  const result = []
  const text = block.children[0].children[0].children[0].text
  for (const line of text.split('\n')) result.push(`${indent}${line}\n`)
  return result.join('')
}
