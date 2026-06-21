import { describe, expect, it } from 'vitest'
import { buildRcloneFilterRules, buildBisyncArgs, RCLONE_SYNC_COMMAND } from '../../back/app/sync/rcloneArgs.js'

describe('rclone sync helpers', () => {
  it('uses rclone bisync as the sync command', () => {
    expect(RCLONE_SYNC_COMMAND).toBe('bisync')
  })

  it('builds the default ElephantNote ignore rules', () => {
    expect(buildRcloneFilterRules()).toContain('- .git/**')
    expect(buildRcloneFilterRules()).toContain('- .elephantnote/search/**')
    expect(buildRcloneFilterRules()).toContain('+ **')
  })

  it('excludes common OS metadata files', () => {
    const rules = buildRcloneFilterRules()
    expect(rules).toContain('- .DS_Store')
    expect(rules).toContain('- Thumbs.db')
    expect(rules).toContain('- desktop.ini')
  })

  it('excludes common temporary editor files', () => {
    const rules = buildRcloneFilterRules()
    expect(rules).toContain('- ~$*')
    expect(rules).toContain('- ~*.tmp')
    expect(rules).toContain('- .~*')
    expect(rules).toContain('- *.swp')
    expect(rules).toContain('- *.tmp')
  })

  it('excludes ElephantNote cache directories', () => {
    const rules = buildRcloneFilterRules()
    expect(rules).toContain('- .elephantnote/cache/**')
    expect(rules).toContain('- .elephantnote/logs/**')
    expect(rules).toContain('- .elephantnote/search/**')
  })

  it('keeps shared vault content included after exclusions', () => {
    expect(buildRcloneFilterRules().at(-1)).toBe('+ **')
  })

  it('does not produce duplicate filter rules', () => {
    const rules = buildRcloneFilterRules()
    expect(new Set(rules).size).toBe(rules.length)
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

  it('keeps local paths unchanged', () => {
    expect(buildBisyncArgs({ localPath: '/Users/noam/My Vault', remotePath: 'remote:vault' })[1])
      .toBe('/Users/noam/My Vault')
  })

  it('keeps rclone remote paths unchanged', () => {
    expect(buildBisyncArgs({ localPath: '/vault', remotePath: 'drive:Elephant Note' })[2])
      .toBe('drive:Elephant Note')
  })

  it('keeps local destination paths unchanged', () => {
    expect(buildBisyncArgs({ localPath: '/vault', remotePath: '/Volumes/Backup/Elephant' })[2])
      .toBe('/Volumes/Backup/Elephant')
  })

  it('does not add resync when explicitly disabled', () => {
    expect(buildBisyncArgs({ localPath: '/vault', remotePath: 'remote:vault', resync: false }))
      .not.toContain('--resync')
  })

  it('adds resync when explicitly enabled', () => {
    expect(buildBisyncArgs({ localPath: '/vault', remotePath: 'remote:vault', resync: true }))
      .toContain('--resync')
  })

  it('defaults to resync for safety on new pairs', () => {
    expect(buildBisyncArgs({ localPath: '/vault', remotePath: 'remote:vault' }).at(-1)).toBe('--resync')
  })

  it('keeps command order stable for executor calls', () => {
    const args = buildBisyncArgs({ localPath: 'A', remotePath: 'B', resync: false })
    expect(args[0]).toBe('bisync')
    expect(args[1]).toBe('A')
    expect(args[2]).toBe('B')
  })

  it('does not mutate returned arrays across calls', () => {
    const first = buildBisyncArgs({ localPath: 'A', remotePath: 'B' })
    first.push('--extra')
    expect(buildBisyncArgs({ localPath: 'A', remotePath: 'B' })).not.toContain('--extra')
  })

  it('returns a fresh filter array on each call', () => {
    const first = buildRcloneFilterRules()
    first.push('- custom/**')
    expect(buildRcloneFilterRules()).not.toContain('- custom/**')
  })
})
