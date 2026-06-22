import { describe, expect, it } from 'vitest'

import ModelsView from '../../Elephant/front/app/components/views/ModelsView.vue'
import { getDownloadOption } from '../../Elephant/front/app/components/views/modelsViewHelpers.js'

describe('models view runtime imports', () => {
  it('imports the real ModelsView component without missing helper exports', () => {
    expect(ModelsView).toBeTruthy()
    expect(typeof ModelsView).toBe('object')
  })

  it('exports getDownloadOption used by the real ModelsView download card', () => {
    const option = getDownloadOption({
      repoId: 'org/model',
      siblings: [{ rfilename: 'model.Q4_K_M.gguf', size: 1024 * 1024 * 4 }]
    })
    expect(option.fileName).toBe('model.Q4_K_M.gguf')
    expect(option.format).toBe('GGUF')
    expect(option.quantization).toBe('Q4_K_M')
    expect(option.sizeLabel).toBe('4 MB')
  })
})
