export const RCLONE_SYNC_COMMAND = 'bisync'

export const buildRcloneFilterRules = () => [
  '- .git/**',
  '- .DS_Store',
  '- Thumbs.db',
  '- desktop.ini',
  '- ~$*',
  '- ~*.tmp',
  '- .~*',
  '- *.swp',
  '- *.tmp',
  '- .elephantnote/cache/**',
  '- .elephantnote/logs/**',
  '- .elephantnote/search/**',
  '- .elephantnote/sync-local.json',
  '+ **'
]
