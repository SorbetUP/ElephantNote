export const buildRcloneFilterRules = () => [
  '- .git/**',
  '- .DS_Store',
  '- Thumbs.db',
  '- desktop.ini',
  '+ **'
]
