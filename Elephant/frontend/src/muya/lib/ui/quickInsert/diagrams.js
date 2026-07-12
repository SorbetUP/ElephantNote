import { quickInsertIcons as icons } from './icons'

export const createDiagramBlocks = (translate) => [{
  title: translate('quickInsert.vegaChart.title'),
  subTitle: translate('quickInsert.vegaChart.subtitle'),
  label: 'vega-lite',
  icon: icons.vega
}, {
  title: translate('quickInsert.flowChart.title'),
  subTitle: translate('quickInsert.flowChart.subtitle'),
  label: 'flowchart',
  icon: icons.flowchart
}, {
  title: translate('quickInsert.sequenceChart.title'),
  subTitle: translate('quickInsert.sequenceChart.subtitle'),
  label: 'sequence',
  icon: icons.sequence
}, {
  title: translate('quickInsert.plantUMLChart.title'),
  subTitle: translate('quickInsert.plantUMLChart.subtitle'),
  label: 'plantuml',
  icon: icons.plantuml
}, {
  title: translate('quickInsert.mermaid.title'),
  subTitle: translate('quickInsert.mermaid.subtitle'),
  label: 'mermaid',
  icon: icons.mermaid
}]
