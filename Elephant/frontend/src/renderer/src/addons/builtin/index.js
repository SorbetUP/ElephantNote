import { addonPacksAddon, addonProfilesAddon } from './addonProfiles'
import { googleKeepImportAddon } from './googleKeepImport'
import { codexConnectionAddon } from './codexConnection'
import { calendarAddon } from './calendar'
import { sitesAddon } from './sites'
import { aiAddon } from './ai'
import { syncAddon } from './sync'
import { codeExecutionAddon } from './codeExecution'
import { excalidrawAddon } from './excalidraw'

export {
  addonPacksAddon,
  addonProfilesAddon,
  googleKeepImportAddon,
  codexConnectionAddon,
  calendarAddon,
  sitesAddon,
  aiAddon,
  syncAddon,
  codeExecutionAddon,
  excalidrawAddon
}

export const builtinAddons = [
  addonPacksAddon,
  googleKeepImportAddon,
  codexConnectionAddon,
  calendarAddon,
  sitesAddon,
  aiAddon,
  syncAddon,
  codeExecutionAddon,
  excalidrawAddon
]
