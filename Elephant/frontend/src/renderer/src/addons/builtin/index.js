import { addonInspectorAddon } from './addonInspector'
import { dailyNotesAddon } from './dailyNotes'
import { quickCaptureAddon } from './quickCapture'
import { vaultOverviewAddon } from './vaultOverview'

export {
  addonInspectorAddon,
  dailyNotesAddon,
  quickCaptureAddon,
  vaultOverviewAddon
}

export const builtinAddons = [
  dailyNotesAddon,
  quickCaptureAddon,
  vaultOverviewAddon,
  addonInspectorAddon
]
