import { addonInspectorAddon } from './addonInspector'
import { addonProfilesAddon } from './addonProfiles'
import { calendarAddon } from './calendar'
import { dailyNotesAddon } from './dailyNotes'
import { quickCaptureAddon } from './quickCapture'
import { vaultOverviewAddon } from './vaultOverview'

export {
  addonInspectorAddon,
  addonProfilesAddon,
  calendarAddon,
  dailyNotesAddon,
  quickCaptureAddon,
  vaultOverviewAddon
}

export const builtinAddons = [
  dailyNotesAddon,
  quickCaptureAddon,
  vaultOverviewAddon,
  addonProfilesAddon,
  calendarAddon,
  addonInspectorAddon
]
