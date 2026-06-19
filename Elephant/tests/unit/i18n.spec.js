import fs from 'fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  clearCache,
  getAllTranslations,
  getTranslation,
  loadTranslations
} from '../../../src/common/i18n.js'

describe('i18n translation loading', () => {
  beforeEach(() => {
    clearCache()
    vi.stubEnv('NODE_ENV', 'development')
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
    clearCache()
  })

  it('falls back to an empty catalog when a locale file is missing', () => {
    const existsSpy = vi.spyOn(fs, 'existsSync').mockReturnValue(false)
    const readSpy = vi.spyOn(fs, 'readFileSync')

    const translations = loadTranslations('fr')

    expect(existsSpy).toHaveBeenCalled()
    expect(readSpy).not.toHaveBeenCalled()
    expect(translations).toEqual({})
    expect(getAllTranslations('fr')).toEqual({})
    expect(getTranslation('settings.chat.title', 'fr')).toBe('settings.chat.title')
  })

  it('loads and interpolates a translation file when present', () => {
    vi.spyOn(fs, 'existsSync').mockImplementation((filePath) => String(filePath).endsWith('/fr.min.json'))
    vi.spyOn(fs, 'readFileSync').mockImplementation((filePath) => {
      if (!String(filePath).endsWith('/fr.min.json')) {
        throw new Error('Unexpected file read')
      }
      return JSON.stringify({
        settings: {
          chat: {
            title: 'Chat {name}'
          }
        }
      })
    })

    expect(loadTranslations('fr')).toEqual({
      settings: {
        chat: {
          title: 'Chat {name}'
        }
      }
    })
    expect(getTranslation('settings.chat.title', 'fr', { name: 'local' })).toBe('Chat local')
  })
})
