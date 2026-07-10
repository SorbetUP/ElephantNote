import { useNavigationStore } from 'elephant-front/stores/navigationStore'
import { useSearchStore } from 'elephant-front/stores/searchStore'
import { useVaultStore } from 'elephant-front/stores/vaultStore'

const MOBILE_BACK_STATE = '__elephantnoteMobileBackState'
const DRAWER_KEEP_OPEN_SELECTOR = [
  '.en-sidebar-tree-toggle',
  '.en-recent-heading',
  '.en-recent-more'
].join(', ')
const OPEN_DRAWER_SELECTOR = '.en-mobile-icon-button[aria-label="Open navigation"]'
const CLOSE_DRAWER_SELECTOR = '.en-mobile-scrim.visible'
const SWIPE_EDGE_PX = 24
const DIRECTION_LOCK_PX = 8
const OPEN_PROGRESS_THRESHOLD = 0.42
const FLING_VELOCITY_PX_MS = 0.38

const clamp = (value, min, max) => Math.min(max, Math.max(min, value))

const isMobileViewport = (target = globalThis) => Boolean(
  target.matchMedia?.('(max-width: 760px), (hover: none) and (pointer: coarse)').matches
)

const getShell = (target = globalThis) => target.document?.querySelector?.('.en-shell.en-mobile-shell') || null
const getSidebar = (target = globalThis) => target.document?.querySelector?.('.en-mobile-shell .en-sidebar') || null
const isDrawerOpen = (target = globalThis) => getShell(target)?.classList.contains('en-mobile-drawer-open') === true

const clickElement = (target, selector) => {
  const element = target.document?.querySelector?.(selector)
  if (!element || typeof element.click !== 'function') return false
  element.click()
  return true
}

const openDrawer = (target = globalThis) => {
  if (isDrawerOpen(target)) return true
  return clickElement(target, OPEN_DRAWER_SELECTOR)
}

const closeDrawer = (target = globalThis) => {
  if (!isDrawerOpen(target)) return false
  return clickElement(target, CLOSE_DRAWER_SELECTOR)
}

const preserveDrawerForLocalToggle = (target, event) => {
  if (!isDrawerOpen(target)) return
  if (!event.target?.closest?.(DRAWER_KEEP_OPEN_SELECTOR)) return

  const shell = getShell(target)
  shell?.classList.add('en-mobile-preserve-drawer')

  // AppShell still has a generic compatibility close handler. Re-open before
  // the next paint so local tree/recent toggles never collapse the drawer.
  target.queueMicrotask(() => {
    target.requestAnimationFrame(() => {
      if (!isDrawerOpen(target)) openDrawer(target)
      target.requestAnimationFrame(() => shell?.classList.remove('en-mobile-preserve-drawer'))
    })
  })
}

const setInteractiveDrawerPosition = (shell, width, progress) => {
  const normalized = clamp(progress, 0, 1)
  const offset = Math.round((normalized - 1) * width)
  shell.style.setProperty('--en-mobile-drawer-offset', `${offset}px`)
  shell.style.setProperty('--en-mobile-drawer-progress', String(normalized))
}

const clearInteractiveDrawerPosition = (shell) => {
  shell.style.removeProperty('--en-mobile-drawer-offset')
  shell.style.removeProperty('--en-mobile-drawer-progress')
  shell.classList.remove('en-mobile-drawer-dragging', 'en-mobile-drawer-settling')
}

const installDrawerGestures = (target = globalThis) => {
  let gesture = null

  const reset = () => {
    if (gesture?.shell) clearInteractiveDrawerPosition(gesture.shell)
    gesture = null
  }

  const onPointerDown = (event) => {
    if (!isMobileViewport(target) || event.isPrimary === false || event.button > 0) return
    const shell = getShell(target)
    const sidebar = getSidebar(target)
    if (!shell || !sidebar) return

    const drawerOpen = isDrawerOpen(target)
    const startedInsideDrawer = !!event.target?.closest?.('.en-sidebar, .en-mobile-scrim')
    if (!drawerOpen && event.clientX > SWIPE_EDGE_PX) return
    if (drawerOpen && !startedInsideDrawer) return

    const width = Math.max(1, sidebar.getBoundingClientRect().width)
    gesture = {
      pointerId: event.pointerId,
      shell,
      width,
      drawerOpen,
      startX: event.clientX,
      startY: event.clientY,
      lastX: event.clientX,
      lastAt: performance.now(),
      velocityX: 0,
      progress: drawerOpen ? 1 : 0,
      locked: false,
      cancelled: false
    }
    setInteractiveDrawerPosition(shell, width, gesture.progress)
  }

  const onPointerMove = (event) => {
    if (!gesture || event.pointerId !== gesture.pointerId) return
    const dx = event.clientX - gesture.startX
    const dy = event.clientY - gesture.startY

    if (!gesture.locked) {
      if (Math.abs(dx) < DIRECTION_LOCK_PX && Math.abs(dy) < DIRECTION_LOCK_PX) return
      if (Math.abs(dy) > Math.abs(dx)) {
        gesture.cancelled = true
        reset()
        return
      }
      gesture.locked = true
      gesture.shell.classList.add('en-mobile-drawer-dragging')
      try {
        event.target?.setPointerCapture?.(event.pointerId)
      } catch {
        // Some Android WebViews reject capture after DOM changes; document-level
        // listeners below still keep the drag continuous.
      }
    }

    event.preventDefault()
    const now = performance.now()
    const elapsed = Math.max(1, now - gesture.lastAt)
    gesture.velocityX = (event.clientX - gesture.lastX) / elapsed
    gesture.lastX = event.clientX
    gesture.lastAt = now

    const progress = gesture.drawerOpen
      ? 1 + Math.min(0, dx) / gesture.width
      : Math.max(0, dx) / gesture.width
    gesture.progress = clamp(progress, 0, 1)
    setInteractiveDrawerPosition(gesture.shell, gesture.width, gesture.progress)
  }

  const settle = (event) => {
    if (!gesture || (event?.pointerId != null && event.pointerId !== gesture.pointerId)) return
    const current = gesture
    gesture = null

    if (!current.locked || current.cancelled) {
      clearInteractiveDrawerPosition(current.shell)
      return
    }

    const shouldOpen = current.velocityX > FLING_VELOCITY_PX_MS ||
      (current.velocityX >= -FLING_VELOCITY_PX_MS && current.progress >= OPEN_PROGRESS_THRESHOLD)
    current.shell.classList.remove('en-mobile-drawer-dragging')
    current.shell.classList.add('en-mobile-drawer-settling')
    setInteractiveDrawerPosition(current.shell, current.width, shouldOpen ? 1 : 0)

    if (shouldOpen) openDrawer(target)
    else closeDrawer(target)

    target.setTimeout(() => clearInteractiveDrawerPosition(current.shell), 300)
  }

  target.document.addEventListener('pointerdown', onPointerDown, { passive: true })
  target.document.addEventListener('pointermove', onPointerMove, { passive: false })
  target.document.addEventListener('pointerup', settle, { passive: true })
  target.document.addEventListener('pointercancel', settle, { passive: true })

  return () => {
    target.document.removeEventListener('pointerdown', onPointerDown)
    target.document.removeEventListener('pointermove', onPointerMove)
    target.document.removeEventListener('pointerup', settle)
    target.document.removeEventListener('pointercancel', settle)
    reset()
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
          if (vaultStore.openedNotePath) {
            vaultStore.closeNote()
            handled = true
          } else {
            const previous = navigationStore.back()
            if (previous) {
              await vaultStore.navigateTo(previous)
              handled = true
            }
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
    console.info('[mobile-navigation] interactive edge drawer and Android back navigation installed')
    return true
  }

  if (installWhenMounted()) return true

  const Observer = target.MutationObserver
  if (typeof Observer !== 'function') return false
  const observer = new Observer(() => {
    if (installWhenMounted()) observer.disconnect()
  })
  observer.observe(target.document.documentElement, { childList: true, subtree: true })
  return true
}

installMobileInteractionRuntime()
