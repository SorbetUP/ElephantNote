import tableCreation from './tableCreation'
import tableToolbar from './tableToolbar'
import tableEdit from './tableEdit'
import tableQueries from './tableQueries'

const tableBlockCtrl = ContentState => {
  tableCreation(ContentState)
  tableToolbar(ContentState)
  tableEdit(ContentState)
  tableQueries(ContentState)
}

export default tableBlockCtrl
