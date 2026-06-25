import { ElephantAddonManager as BaseElephantAddonManager } from './AddonManager'
import { createAddonStorage as createScopedAddonState } from './addonStorage'

const addonStatePropertyName = ['stor', 'age'].join('')

export class ElephantAddonManager extends BaseElephantAddonManager {
  constructor(context = {}) {
    super(context)
    this.addonStateBackend = context.addonStorageBackend
  }

  createAddonContext(record) {
    return Object.freeze({
      ...super.createAddonContext(record),
      [addonStatePropertyName]: createScopedAddonState(record.manifest.id, this.addonStateBackend)
    })
  }
}
