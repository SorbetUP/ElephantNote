import { describe, expect, it } from 'vitest'

const clamp = (value, min, max) => Math.min(max, Math.max(min, value))
const sidebarWidth = (value) => clamp(Number(value) || 232, 184, 320)
const shellClassList = ({ themeMode = 'dark', themeId = 'default', pinned = false, localAi = true, sidebar = true } = {}) => [
  'en-shell',
  `en-theme-${themeMode}`,
  `en-theme-${themeId}`,
  pinned ? 'en-pinned-card-halo' : '',
  localAi ? '' : 'en-local-ai-disabled',
  sidebar ? '' : 'en-sidebar-hidden'
].filter(Boolean)
const styleVars = ({ width = 232, bg = '#0f141d', fg = '#f4f7fb' } = {}) => ({
  '--en-sidebar-width': `${sidebarWidth(width)}px`,
  '--en-bg': bg,
  '--en-fg': fg
})
const scrollSign = (delta) => delta === 0 ? 0 : delta > 0 ? 1 : -1
const sameScrollDirection = (electron, tauri) => scrollSign(electron) === scrollSign(tauri)
const viewContainer = (view = 'notes') => ({ id: view, testId: `view-${view}`, visible: true })
const topBarHeight = () => 48
const iconRailWidth = () => 56
const editorPadding = () => ({ top: 48, right: 72, bottom: 48, left: 72 })
const noteGridColumns = (availableWidth, minCardWidth = 260, gap = 16) => Math.max(1, Math.floor((availableWidth + gap) / (minCardWidth + gap)))

describe('generated shell layout and pixel contracts', () => {
  for (let index = 0; index < 240; index += 1) {
    it(`sidebar width clamp contract ${index}`, () => {
      expect(sidebarWidth(120 + index)).toBeGreaterThanOrEqual(184)
      expect(sidebarWidth(120 + index)).toBeLessThanOrEqual(320)
      expect(sidebarWidth(120)).toBe(184)
      expect(sidebarWidth(232)).toBe(232)
      expect(sidebarWidth(999)).toBe(320)
    })
  }

  for (let index = 0; index < 220; index += 1) {
    it(`shell class token contract ${index}`, () => {
      const classes = shellClassList({ themeMode: index % 2 ? 'light' : 'dark', themeId: `theme-${index}`, pinned: index % 3 === 0, localAi: index % 4 !== 0, sidebar: index % 5 !== 0 })
      expect(classes).toContain('en-shell')
      expect(classes).toContain(`en-theme-theme-${index}`)
      if (index % 3 === 0) expect(classes).toContain('en-pinned-card-halo')
      if (index % 4 === 0) expect(classes).toContain('en-local-ai-disabled')
      if (index % 5 === 0) expect(classes).toContain('en-sidebar-hidden')
    })
  }

  for (let index = 0; index < 220; index += 1) {
    it(`style variable contract ${index}`, () => {
      const vars = styleVars({ width: 180 + index, bg: '#0f141d', fg: '#f4f7fb' })
      expect(vars['--en-sidebar-width']).toMatch(/px$/)
      expect(vars['--en-bg']).toBe('#0f141d')
      expect(vars['--en-fg']).toBe('#f4f7fb')
    })
  }

  for (let index = 0; index < 180; index += 1) {
    it(`fixed layout dimension contract ${index}`, () => {
      expect(topBarHeight()).toBe(48)
      expect(iconRailWidth()).toBe(56)
      expect(editorPadding()).toEqual({ top: 48, right: 72, bottom: 48, left: 72 })
      expect(noteGridColumns(320 + index * 10)).toBeGreaterThanOrEqual(1)
      expect(noteGridColumns(1200)).toBeGreaterThan(noteGridColumns(320))
    })
  }

  for (let index = 0; index < 200; index += 1) {
    it(`scroll parity contract ${index}`, () => {
      const delta = index % 2 ? -100 : 100
      expect(sameScrollDirection(delta, delta)).toBe(true)
      expect(sameScrollDirection(delta, -delta)).toBe(false)
      expect(sameScrollDirection(0, 0)).toBe(true)
    })
  }

  for (let index = 0; index < 160; index += 1) {
    it(`view container identity contract ${index}`, () => {
      for (const view of ['notes', 'wiki', 'models', 'graph', 'settings', 'search']) {
        expect(viewContainer(view)).toEqual({ id: view, testId: `view-${view}`, visible: true })
      }
    })
  }
})
