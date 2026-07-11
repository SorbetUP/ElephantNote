import { addonInspectorAddon } from './addonInspector'
import { addonProfilesAddon } from './addonProfiles'
import { calendarAddon } from './calendar'
import { codexConnectionAddon } from './codexConnection'
import { dailyNotesAddon } from './dailyNotes'
import { googleKeepImportAddon } from './googleKeepImport'
import { quickCaptureAddon } from './quickCapture'
import { sitesAddon } from './sites'
import { vaultOverviewAddon } from './vaultOverview'

export {
  addonInspectorAddon,
  addonProfilesAddon,
  calendarAddon,
  codexConnectionAddon,
  dailyNotesAddon,
  googleKeepImportAddon,
  quickCaptureAddon,
  sitesAddon,
  vaultOverviewAddon
}

export const builtinAddons = [
  addonProfilesAddon,
  googleKeepImportAddon,
  codexConnectionAddon,
  calendarAddon,
  sitesAddon,
  dailyNotesAddon,
  quickCaptureAddon,
  vaultOverviewAddon,
  addonInspectorAddon
]
