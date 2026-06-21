export const RCLONE_SYNC_COMMAND = 'bisync'

export const buildRcloneFilterRules = () => [
  '- .git/**',
  '- .DS_Store',
  '- Thumbs.db',
  '- desktop.ini',
  '+ **'
]
