import { addonPacksAddon, addonProfilesAddon } from './addonProfiles'
import { googleKeepImportAddon } from './googleKeepImport'
import { codexConnectionAddon } from './codexConnection'
import { calendarAddon } from './calendar'
import { sitesAddon } from './sites'
import { dailyNotesAddon } from './dailyNotes'
import { quickCaptureAddon } from './quickCapture'
import { vaultOverviewAddon } from './vaultOverview'
import { addonInspectorAddon } from './addonInspector'

export {
  addonPacksAddon,
  addonProfilesAddon,
  googleKeepImportAddon,
  codexConnectionAddon,
  calendarAddon,
  sitesAddon,
  dailyNotesAddon,
  quickCaptureAddon,
  vaultOverviewAddon,
  addonInspectorAddon
}

export const builtinAddons = [
  addonPacksAddon,
  googleKeepImportAddon,
  codexConnectionAddon,
  calendarAddon,
  sitesAddon,
  dailyNotesAddon,
  quickCaptureAddon,
  vaultOverviewAddon,
  addonInspectorAddon
]
