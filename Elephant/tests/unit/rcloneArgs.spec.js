import { describe, expect, it } from 'vitest'
import { buildRcloneFilterRules, buildBisyncArgs, RCLONE_SYNC_COMMAND } from '../../back/app/sync/rcloneArgs.js'

describe('rclone sync helpers', () => {
  it('builds the default ElephantNote ignore rules', () => {
    expect(buildRcloneFilterRules()).toContain('- .git/**')
    expect(buildRcloneFilterRules()).toContain('- .elephantnote/search/**')
    expect(buildRcloneFilterRules()).toContain('+ **')
  })

  it('builds the first-run bisync command shape', () => {
    expect(buildBisyncArgs({ localPath: '/vault', remotePath: 'remote:vault' })).toEqual([
      RCLONE_SYNC_COMMAND,
      '/vault',
      'remote:vault',
      '--resync'
    ])
  })

  it('can build a normal bisync run without resync', () => {
    expect(buildBisyncArgs({ localPath: '/vault', remotePath: 'remote:vault', resync: false })).toEqual([
      RCLONE_SYNC_COMMAND,
      '/vault',
      'remote:vault'
    ])
  })
})
