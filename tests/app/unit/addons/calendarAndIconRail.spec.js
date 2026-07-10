import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  addonViewRailId,
  moveIconRailItem,
  normalizeIconRailHidden,
  normalizeIconRailOrder
} from '../../../../Elephant/frontend/app/components/navigation/iconRailLayout.js'

const root = process.cwd()
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8')
const exists = (relativePath) => fs.existsSync(path.join(root, relativePath))

describe('optional Calendar addon and configurable icon rail', () => {
  it('normalizes persisted order as features and addon views change', () => {
    const tasks = addonViewRailId('com.elephantnote.elephant-tasks.workspace')
    const available = ['dashboard', 'wiki', tasks, 'search']

    expect(normalizeIconRailOrder(['search', 'unknown', 'search', tasks], available))
      .toEqual(['search', tasks, 'dashboard', 'wiki'])
    expect(normalizeIconRailHidden(['unknown', tasks, tasks], available)).toEqual([tasks])
    expect(moveIconRailItem(['dashboard', 'wiki', tasks], tasks, 0)).toEqual([tasks, 'dashboard', 'wiki'])
  })

  it('removes Calendar from the vanilla shell and registers it as disabled addon', () => {
    const main = read('Elephant/frontend/app/components/shell/MainContent.vue')
    const rail = read('Elephant/frontend/app/components/navigation/IconRail.vue')
    const calendar = read('Elephant/frontend/src/renderer/src/addons/builtin/calendar.js')
    const builtins = read('Elephant/frontend/src/renderer/src/addons/builtin/index.js')

    expect(exists('Elephant/frontend/app/components/views/CalendarView.vue')).toBe(false)
    expect(main).not.toContain('CalendarView')
    expect(main).not.toContain("activeWorkspaceView === 'calendar'")
    expect(rail).not.toContain("store.setWorkspaceView('calendar')")
    expect(calendar).toContain("const ADDON_ID = 'elephant.calendar'")
    expect(calendar).toContain('id: ADDON_ID')
    expect(calendar).toContain('defaultEnabled: false')
    expect(calendar).toContain("kind: 'calendar-v1'")
    expect(calendar).toContain('elephantnoteClient.calendar.list()')
    expect(builtins).toContain('calendarAddon')
  })

  it('lets Settings reorder and hide core and addon icons while keeping safety controls fixed', () => {
    const settings = read('Elephant/frontend/app/components/settings/SettingsPanel.vue')
    const organizer = read('Elephant/frontend/app/components/settings/IconRailLayoutSettings.vue')
    const rail = read('Elephant/frontend/app/components/navigation/IconRail.vue')
    const preferences = read('Elephant/frontend/src/renderer/src/store/preferences.js')

    expect(settings).toContain('<icon-rail-layout-settings />')
    expect(settings).toContain("label: 'Vertical icon bar'")
    expect(organizer).toContain('@dragstart="startDrag(item.id, $event)"')
    expect(organizer).toContain('toggleVisibility(item.id)')
    expect(organizer).toContain('resetLayout')
    expect(rail).toContain('normalizeIconRailOrder(preferences.iconRailOrder')
    expect(rail).toContain("addonsStore.getContributions('views')")
    expect(preferences).toContain('iconRailOrder:')
    expect(preferences).toContain('iconRailHidden: []')
    expect(organizer).toContain('Settings button remain fixed')
  })
})
