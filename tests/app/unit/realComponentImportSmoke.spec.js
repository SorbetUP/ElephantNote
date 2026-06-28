import { describe, expect, it } from 'vitest'

const imports = [
  ['App page', () => import('../../../Elephant/frontend/src/renderer/src/pages/app.vue')],
  ['App shell', () => import('../../../Elephant/frontend/app/components/shell/AppShell.vue')],
  ['Models view', () => import('../../../Elephant/frontend/app/components/views/ModelsView.vue')],
  ['Wiki view', () => import('../../../Elephant/frontend/app/components/views/WikiView.vue')],
  ['Search modal', () => import('../../../Elephant/frontend/app/search/SearchModal.vue')],
  ['Settings panel', () => import('../../../Elephant/frontend/app/components/settings/SettingsPanel.vue')]
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
