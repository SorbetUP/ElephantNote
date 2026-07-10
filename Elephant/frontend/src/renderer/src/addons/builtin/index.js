import { addonInspectorAddon } from './addonInspector'
import { addonProfilesAddon } from './addonProfiles'
import { dailyNotesAddon } from './dailyNotes'
import { quickCaptureAddon } from './quickCapture'
import { vaultOverviewAddon } from './vaultOverview'

export {
  addonInspectorAddon,
  addonProfilesAddon,
  dailyNotesAddon,
  quickCaptureAddon,
  vaultOverviewAddon
}

export const builtinAddons = [
  dailyNotesAddon,
  quickCaptureAddon,
  vaultOverviewAddon,
  addonProfilesAddon,
  addonInspectorAddon
]
