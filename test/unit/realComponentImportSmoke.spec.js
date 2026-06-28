import { describe, expect, it } from 'vitest'

const imports = [
  ['App page', () => import('../../src/renderer/src/pages/app.vue')],
  ['App shell', () => import('../../Elephant/front/app/components/shell/AppShell.vue')],
  ['Models view', () => import('../../Elephant/front/app/components/views/ModelsView.vue')],
  ['Wiki view', () => import('../../Elephant/front/app/components/views/WikiView.vue')],
  ['Search modal', () => import('../../Elephant/front/app/search/SearchModal.vue')],
  ['Settings panel', () => import('../../Elephant/front/app/components/settings/SettingsPanel.vue')]
]

describe('real component import smoke', () => {
  for (const [name, load] of imports) {
    const timeout = name === 'App page' ? 15000 : 5000
    it(`${name} imports without renderer bootstrap errors`, async() => {
      const module = await load()
      expect(module.default).toBeTruthy()
    }, timeout)
  }
})
