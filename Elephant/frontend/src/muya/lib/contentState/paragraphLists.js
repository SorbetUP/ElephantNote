import { handleListMenu } from './paragraphListMenu'
import { handleLooseListItem } from './paragraphLooseList'

const paragraphLists = ContentState => {
  ContentState.prototype.handleListMenu = handleListMenu
  ContentState.prototype.handleLooseListItem = handleLooseListItem
}

export default paragraphLists
