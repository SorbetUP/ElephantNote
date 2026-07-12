import ImageIcon from '../../../../assets/pngicon/image/2.png'
import ImageFailIcon from '../../../../assets/pngicon/image_fail/2.png'
import DeleteIcon from '../../../../assets/pngicon/delete/2.png'

const renderIcon = (h, className, icon) => h(
  `span.${className}`,
  { attrs: { contenteditable: 'false' } },
  h(
    'i.icon',
    h(
      'i.icon-inner',
      {
        style: {
          background: `url(${icon}) no-repeat`,
          'background-size': '100%'
        }
      },
      ''
    )
  )
)

export const renderImageIcons = h => [
  renderIcon(h, 'ag-image-icon-success', ImageIcon),
  renderIcon(h, 'ag-image-icon-fail', ImageFailIcon),
  renderIcon(h, 'ag-image-icon-close', DeleteIcon)
]
