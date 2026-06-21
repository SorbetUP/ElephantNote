import { describe, expect, it } from 'vitest'
import { buildRcloneFilterRules, buildBisyncArgs, RCLONE_SYNC_COMMAND } from '../../back/app/sync/rcloneArgs.js'

describe('rclone sync helpers', () => {
  it('builds the default ElephantNote ignore rules', () => {
    expect(buildRcloneFilterRules()).toContain('- .git/**')
    expect(buildRcloneFilterRules()).toContain('- .elephantnote/search/**')
    expect(buildRcloneFilterRules()).toContain('+ **')
  })

  it('builds the basic bisync command shape', () => {
    expect(buildBisyncArgs({ localPath: '/vault', remotePath: 'remote:vault' })).toEqual([
      RCLONE_SYNC_COMMAND,
      '/vault',
      'remote:vault'
    ])
  })
})
