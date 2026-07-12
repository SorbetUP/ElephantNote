import { search } from './searchDocument'
import { find, setCursorToHighlight } from './searchNavigation'
import { buildRegexValue, replace, replaceOne } from './searchReplacement'

const searchCtrl = ContentState => {
  ContentState.prototype.buildRegexValue = buildRegexValue
  ContentState.prototype.replaceOne = replaceOne
  ContentState.prototype.replace = replace
  ContentState.prototype.setCursorToHighlight = setCursorToHighlight
  ContentState.prototype.find = find
  ContentState.prototype.search = search
}

export default searchCtrl
