export const wordCount = (markdown) => {
  const paragraph = markdown.split(/\n{2,}/).filter((line) => line).length
  let word = 0
  let character = 0
  let all = 0

  const removedChinese = markdown.replace(/[\u4e00-\u9fa5]/g, '')
  const tokens = removedChinese.split(/[\s\n]+/).filter((token) => token)
  const chineseWordLength = markdown.length - removedChinese.length
  word += chineseWordLength + tokens.length
  character += tokens.reduce((total, token) => total + token.length, 0) + chineseWordLength
  all += markdown.length

  return { word, paragraph, character, all }
}
