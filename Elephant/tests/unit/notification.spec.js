import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

describe('renderer notifications', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    vi.resetModules()
    vi.useFakeTimers()
    window.__TAURI__ = {}
  })

  afterEach(() => {
    vi.useRealTimers()
    delete window.__TAURI__
    delete window.Notification
    document.body.innerHTML = ''
  })

  it('uses the native notification API in a portable runtime when available', async() => {
    const close = vi.fn()
    const nativeNotification = vi.fn().mockImplementation(function(title, options) {
      this.title = title
      this.options = options
      this.close = close
    })
    nativeNotification.permission = 'granted'
    nativeNotification.requestPermission = vi.fn()

    window.Notification = nativeNotification

    const { default: notification } = await import('../../../src/renderer/src/services/notification/index.js')

    await notification.notify({
      title: 'Portable title',
      message: 'Portable message',
      time: 0
    })

    expect(nativeNotification).toHaveBeenCalledWith('Portable title', {
      body: 'Portable message',
      silent: true
    })
    expect(document.querySelector('.mt-notification')).toBeNull()
  })

  it('falls back to the HTML notification when confirmation is required', async() => {
    const nativeNotification = vi.fn()
    nativeNotification.permission = 'granted'
    nativeNotification.requestPermission = vi.fn()
    window.Notification = nativeNotification

    const { default: notification } = await import('../../../src/renderer/src/services/notification/index.js')

    notification.notify({
      title: 'Need confirm',
      message: 'Use the rendered popup',
      showConfirm: true,
      time: 0
    })

    await vi.runAllTimersAsync()

    expect(nativeNotification).not.toHaveBeenCalled()
    expect(document.querySelector('.mt-notification')).not.toBeNull()
  })
})
