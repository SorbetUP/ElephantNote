import { CLASS_OR_ID } from '../../../../config'

export const renderImageContainer = (h, title, children = []) => {
  const data = title ? { dataset: { title } } : {}
  return h(`span.${CLASS_OR_ID.AG_IMAGE_CONTAINER}`, data, children)
}

export const renderImageElement = (h, attrs, domsrc) => {
  const { alt, title, width, height } = attrs
  const data = {
    props: {
      alt: alt.replace(/[`*{}[\]()#+\-.!_>~:|<>$]/g, ''),
      src: domsrc,
      title
    }
  }
  if (typeof width === 'number') Object.assign(data.props, { width })
  if (typeof height === 'number') Object.assign(data.props, { height })
  return h('img', data)
}
