import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

describe('portable preferences runtime', () => {
  beforeEach(() => {
    window.localStorage.clear()
    setActivePinia(createPinia())
    window.__TAURI__ = {}
    window.__MARKTEXT_VERSION_STRING__ = 'v0.18.9'
    delete window.tauri
    vi.resetModules()
  })

  it('hydrates preferences and user data from local storage in a portable runtime', async() => {
    window.localStorage.setItem('elephantnote:pref:language', JSON.stringify('fr'))
    window.localStorage.setItem('elephantnote:pref:autoSave', JSON.stringify(true))
    window.localStorage.setItem('elephantnote:data:imageFolderPath', JSON.stringify('/tmp/assets'))

    const { usePreferencesStore } = await import('../../../../Elephant/frontend/src/renderer/src/store/preferences.js')

    const store = usePreferencesStore()
    store.ASK_FOR_USER_PREFERENCE()

    expect(store.language).toBe('fr')
    expect(store.autoSave).toBe(true)
    expect(store.imageFolderPath).toBe('/tmp/assets')

    store.SET_SINGLE_PREFERENCE({ type: 'autoSave', value: false })
    expect(window.localStorage.getItem('elephantnote:pref:autoSave')).toBe(JSON.stringify(false))

    store.SET_USER_DATA({ type: 'imageFolderPath', value: '/tmp/new-assets' })
    expect(window.localStorage.getItem('elephantnote:data:imageFolderPath'))
      .toBe(JSON.stringify('/tmp/new-assets'))
  })

  it('exposes the portable app metadata in the main store', async() => {
    const { useMainStore } = await import('../../../../Elephant/frontend/src/renderer/src/store/index.js')

    const store = useMainStore()

    expect(store.appVersion).toBe('v0.18.9')
    expect(store.platform).toBe(window.navigator.platform || 'portable')
  })
})
