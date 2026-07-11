import { addonPacksAddon, addonProfilesAddon } from './addonProfiles'
import { googleKeepImportAddon } from './googleKeepImport'
import { codexConnectionAddon } from './codexConnection'
import { calendarAddon } from './calendar'
import { sitesAddon } from './sites'
import { aiAddon } from './ai'
import { syncAddon } from './sync'

export {
  addonPacksAddon,
  addonProfilesAddon,
  googleKeepImportAddon,
  codexConnectionAddon,
  calendarAddon,
  sitesAddon,
  aiAddon,
  syncAddon
}

export const builtinAddons = [
  addonPacksAddon,
  googleKeepImportAddon,
  codexConnectionAddon,
  calendarAddon,
  sitesAddon,
  aiAddon,
  syncAddon
]
