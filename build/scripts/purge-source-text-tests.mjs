#!/usr/bin/env node

import { existsSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '../..')
const files = [
  'tests/app/unit/addons/addonNativeBuildContracts.spec.js',
  'tests/app/unit/addons/addonNativeServiceContracts.spec.js',
  'tests/app/unit/addons/addonRuntimeRegressions.spec.js',
  'tests/app/unit/addons/addonsCatalogueUi.spec.js',
  'tests/app/unit/addons/aiProviderExecutionOwnership.spec.js',
  'tests/app/unit/addons/aiTabsAndRailBorder.spec.js',
  'tests/app/unit/addons/baseOfficialAddonRuntime.spec.js',
  'tests/app/unit/addons/builtinAddons.spec.js',
  'tests/app/unit/addons/calendarAndIconRail.spec.js',
  'tests/app/unit/addons/calendarPackageOwnership.spec.js',
  'tests/app/unit/addons/codexPhysicalService.spec.js',
  'tests/app/unit/addons/coreApiPhysicalBoundary.spec.js',
  'tests/app/unit/addons/coreBridgePhysicalAbsence.spec.js',
  'tests/app/unit/addons/dashboardNoteOnlyRegression.spec.js',
  'tests/app/unit/addons/developNextFinalization.spec.js',
  'tests/app/unit/addons/googleKeepPackageOwnership.spec.js',
  'tests/app/unit/addons/knowledgeConsumerIntegration.spec.js',
  'tests/app/unit/addons/knowledgePhysicalAddon.spec.js',
  'tests/app/unit/addons/nativeMobileCompatibility.spec.js',
  'tests/app/unit/addons/openModelsPhysicalService.spec.js',
  'tests/app/unit/addons/packageResourceContracts.spec.js',
  'tests/app/unit/addons/physicalAddonIsolation.spec.js',
  'tests/app/unit/addons/runtimeSecurityContracts.spec.js',
  'tests/app/unit/addons/searchPackageOwnership.spec.js',
  'tests/app/unit/addons/semanticAddonPipeline.spec.js',
  'tests/app/unit/addons/semanticBackendAbsence.spec.js',
  'tests/app/unit/addons/syncMigrationBoundary.spec.js',
  'tests/app/unit/addons/syncPhysicalOwnership.spec.js',
  'tests/app/unit/addons/syncServiceOwnership.spec.js',
  'tests/app/unit/addons/trustedAddonModuleGraph.spec.js',
  'tests/app/unit/addons/wikiPackageOwnership.spec.js',
  'tests/app/unit/addons/wikiSemanticOrganization.spec.js',
  'tests/app/unit/excalidrawTauriImageLoading.spec.js',
  'tests/app/unit/parityChecklist.spec.js',
  'tests/app/unit/specs/main/elephantnote/agentSkillDeliveryFiles.spec.js',
  'tests/app/unit/specs/main/elephantnote/agentSkills.spec.js',
  'tests/app/unit/specs/main/elephantnote/androidReleaseRecovery.spec.js',
  'tests/app/unit/specs/main/elephantnote/androidUsageRegressionSuite.spec.js',
  'tests/app/unit/specs/main/elephantnote/chatClient.spec.js',
  'tests/app/unit/specs/main/elephantnote/codeExecutionServiceContract.spec.js',
  'tests/app/unit/specs/main/elephantnote/coreUtilities.contract.spec.js',
  'tests/app/unit/specs/main/elephantnote/desktopWindowAndCreateActions.spec.js',
  'tests/app/unit/specs/main/elephantnote/developNextMobileBoundary.spec.js',
  'tests/app/unit/specs/main/elephantnote/developNextMobileExperience.spec.js',
  'tests/app/unit/specs/main/elephantnote/linuxUsageRegressionSuite.spec.js',
  'tests/app/unit/specs/main/elephantnote/mobileIntegrationRepair.spec.js',
  'tests/app/unit/specs/main/elephantnote/settingsRedesign.spec.js',
  'tests/app/unit/specs/main/elephantnote/tauriOnlyRuntime.spec.js',
  'tests/app/unit/specs/main/elephantnote/workflowGuard.spec.js',
  'tests/elephant/unit/noteEditorHostImageLinks.spec.js'
]

const removed = []
for (const relativePath of files) {
  const path = resolve(root, relativePath)
  if (!existsSync(path)) continue
  rmSync(path, { force: true })
  removed.push(relativePath)
}

console.log(`[purge-source-text-tests] requested=${files.length} removed=${removed.length}`)
for (const path of removed) console.log(`[purge-source-text-tests] removed ${path}`)
