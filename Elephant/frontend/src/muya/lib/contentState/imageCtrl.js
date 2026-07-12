import { insertImage } from './imageInsert'
import { deleteImage, replaceImage, updateImage } from './imageMutation'
import { openImage, selectImage } from './imageSelection'

const imageCtrl = (ContentState) => {
  ContentState.prototype.insertImage = insertImage
  ContentState.prototype.updateImage = updateImage
  ContentState.prototype.replaceImage = replaceImage
  ContentState.prototype.deleteImage = deleteImage
  ContentState.prototype.selectImage = selectImage
  ContentState.prototype.openImage = openImage
}

export default imageCtrl
