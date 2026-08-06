import { describe, expect, it } from 'vitest'
import {
  ELEPHANTNOTE_API_ACTIONS as API,
  ELEPHANTNOTE_API_VERSION
} from 'common/elephantnote/apiContractsV2'
import { installTauriApiContractFacade } from '../../../../../src/renderer/src/platform/tauriApiContractFacade'

describe('Tauri API synchronous description compatibility', () => {
  it('accepts a synchronous platform describe implementation', async() => {
    const target = {
      elephantnote: {
        api: {
          describe: () => ({ version: 'sync-backend', actions: [API.VAULTS_GET] }),
          call: async(action, payload) => ({ ok: true, action, data: payload })
        },
        calendar: {},
        models: {},
        search: {},
        atomicFeatures: {}
      }
    }

    expect(installTauriApiContractFacade(target)).toBe(true)
    await expect(target.elephantnote.api.describe()).resolves.toMatchObject({
      version: ELEPHANTNOTE_API_VERSION,
      backendVersion: 'sync-backend',
      contractRevision: 2
    })
  })
})
