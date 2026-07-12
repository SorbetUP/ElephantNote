import execAll from 'execall'

export const matchString = (text, value, options) => {
  const { isCaseSensitive, isWholeWord, isRegexp } = options
  /* eslint-disable no-useless-escape */
  const specialCharReg = /[\[\]\\^$.\|\?\*\+\(\)\/]{1}/g
  /* eslint-enable no-useless-escape */
  let regStr = value
  let flag = 'g'
  if (!isCaseSensitive) flag += 'i'
  if (!isRegexp) {
    regStr = value.replace(specialCharReg, character => {
      return character === '\\' ? '\\\\' : `\\${character}`
    })
  }
  if (isWholeWord) regStr = `\\b${regStr}\\b`
  try {
    return execAll(new RegExp(regStr, flag), text)
  } catch (error) {
    return []
  }
}
