import { isAllowedTransformation } from './paragraphTransformationRules'
import { getTypeFromBlock } from './paragraphTypeResolver'

const paragraphTypes = ContentState => {
  ContentState.prototype.isAllowedTransformation = isAllowedTransformation
  ContentState.prototype.getTypeFromBlock = getTypeFromBlock
}

export default paragraphTypes
