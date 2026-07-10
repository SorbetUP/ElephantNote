import { useNavigationStore } from 'elephant-front/stores/navigationStore'
import { useSearchStore } from 'elephant-front/stores/searchStore'
import { useVaultStore } from 'elephant-front/stores/vaultStore'

const MOBILE_BACK_STATE = '__elephantnoteMobileBackState'
const DRAWER_KEEP_OPEN_SELECTOR = [
  '.en-sidebar-tree-toggle',
  '.en-recent-heading',
  '.en-recent-more'
].join(', ')
const SWIPE_EDGE_PX = 32
const SWIPE_DISTANCE_PX = 64
const SWIPE_VERTICAL_TOLERANCE_PX = 56

const isMobileViewport = (target = globalThis) => Boolean(
  target.matchMedia?.('(max-width: 760px), (hover: none) and (pointer: coarse)').matches
)

const getShell = (target = globalThis) => target.document?.querySelector?.('.en-shell.en-mobile-shell') || null
const isDrawerOpen = (target = globalThis) => getShell(target)?.classList.contains('en-mobile-drawer-open') === true

const clickElement = (target, selector) => {
  const element = target.document?.querySelector?.(selector)
  if (!element || typeof element.click !== 'function') return false
  element.click()
  return true
}

const openDrawer = (target = globalThis) => {
  if (isDrawerOpen(target)) return true
  return clickElement(target, '.en-mobile-icon-button[aria-label="Open navigation"]')
}

const closeDrawer = (target = globalThis) => {
  if (!isDrawerOpen(target)) return false
  return clickElement(target, '.en-mobile-scrim.visible')
}

const preserveDrawerForLocalToggle = (target, event) => {
  if (!isDrawerOpen(target)) return
  if (!event.target?.closest?.(DRAWER_KEEP_OPEN_SELECTOR)) return

  const shell = getShell(target)
  shell?.classList.add('en-mobile-preserve-drawer')

  // AppShell schedules its generic "close on button" callback in requestAnimationFrame.
  // Register after event propagation, then reopen in the same animation frame before paint.
  target.queueMicrotask(() => {
    target.requestAnimationFrame(() => {
      if (!isDrawerOpen(target)) openDrawer(target)
      target.requestAnimationFrame(() => shell?.classList.remove('en-mobile-preserve-drawer'))
    })
  })
}

const installDrawerGestures = (target = globalThis) => {
  let gesture = null

  const onTouchStart = (event) => {
    if (!isMobileViewport(target) || event.touches?.length !== 1) {
      gesture = null
      return
    }
    const touch = event.touches[0]
    gesture = {
      x: touch.clientX,
      y: touch.clientY,
      drawerOpen: isDrawerOpen(target)
    }
  }

  const onTouchEnd = (event) => {
    if (!gesture || event.changedTouches?.length !== 1) {
      gesture = null
      return
    }
    const touch = event.changedTouches[0]
    const dx = touch.clientX - gesture.x
    const dy = touch.clientY - gesture.y
    const horizontal = Math.abs(dx) >= SWIPE_DISTANCE_PX && Math.abs(dy) <= SWIPE_VERTICAL_TOLERANCE_PX

    if (horizontal && gesture.drawerOpen && dx < 0) {
      closeDrawer(target)
    } else if (horizontal && !gesture.drawerOpen && gesture.x <= SWIPE_EDGE_PX && dx > 0) {
      openDrawer(target)
    }
    gesture = null
  }

  target.document.addEventListener('touchstart', onTouchStart, { passive: true })
  target.document.addEventListener('touchend', onTouchEnd, { passive: true })

  return () => {
    target.document.removeEventListener('touchstart', onTouchStart)
    target.document.removeEventListener('touchend', onTouchEnd)
  }
}

const armMobileBackState = (target = globalThis) => {
  const current = target.history?.state || {}
  if (current[MOBILE_BACK_STATE]) return
  target.history?.pushState?.({ ...current, [MOBILE_BACK_STATE]: true }, '', target.location?.href)
}

const installAndroidBackNavigation = (target = globalThis) => {
  let handlingBack = false

  const onPopState = async () => {
    if (!isMobileViewport(target) || handlingBack) return
    handlingBack = true
    let handled = false

    try {
      const settingsClose = target.document.querySelector('.en-settings-close')
      if (settingsClose) {
        settingsClose.click()
        handled = true
      } else {
        const searchStore = useSearchStore()
        if (searchStore.isOpen) {
          searchStore.close()
          handled = true
        } else if (isDrawerOpen(target)) {
          handled = closeDrawer(target)
        } else {
          const vaultStore = useVaultStore()
          const navigationStore = useNavigationStore()
          const previous = navigationStore.back()
          if (previous) {
            await vaultStore.navigateTo(previous)
            handled = true
          } else if (vaultStore.openedNotePath) {
            vaultStore.closeNote()
            handled = true
          }
        }
      }
    } catch (error) {
      console.error('[mobile-navigation] Android back handling failed', error)
    } finally {
      handlingBack = false
      if (handled) target.setTimeout(() => armMobileBackState(target), 0)
    }
  }

  target.addEventListener('popstate', onPopState)
  armMobileBackState(target)
  return () => target.removeEventListener('popstate', onPopState)
}

export const installMobileInteractionRuntime = (target = globalThis) => {
  if (!target?.document || target.__ELEPHANTNOTE_MOBILE_INTERACTIONS_INSTALLED__) return false

  const installWhenMounted = () => {
    if (!getShell(target)) return false

    target.__ELEPHANTNOTE_MOBILE_INTERACTIONS_INSTALLED__ = true
    const onSidebarClick = (event) => preserveDrawerForLocalToggle(target, event)
    target.document.addEventListener('click', onSidebarClick, true)
    const removeGestures = installDrawerGestures(target)
    const removeBackNavigation = installAndroidBackNavigation(target)

    target.__ELEPHANTNOTE_MOBILE_INTERACTIONS_DISPOSE__ = () => {
      target.document.removeEventListener('click', onSidebarClick, true)
      removeGestures()
      removeBackNavigation()
      target.__ELEPHANTNOTE_MOBILE_INTERACTIONS_INSTALLED__ = false
    }
    console.info('[mobile-navigation] swipe drawer and Android back navigation installed')
    return true
  }

  if (installWhenMounted()) return true

  const observer = new MutationObserver(() => {
    if (installWhenMounted()) observer.disconnect()
  })
  observer.observe(target.document.documentElement, { childList: true, subtree: true })
  return true
}

installMobileInteractionRuntime()
