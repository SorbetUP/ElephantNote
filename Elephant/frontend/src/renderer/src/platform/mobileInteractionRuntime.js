import { useNavigationStore } from 'elephant-front/stores/navigationStore'
import { useSearchStore } from 'elephant-front/stores/searchStore'
import { useVaultStore } from 'elephant-front/stores/vaultStore'

const MOBILE_BACK_STATE = '__elephantMobileBackState'
const OPEN_DRAWER_SELECTOR = '.en-mobile-icon-button[aria-label="Open navigation"]'
const CLOSE_DRAWER_SELECTOR = '.en-mobile-scrim.visible'
const EDGE_HANDLE_CLASS = 'en-mobile-drawer-edge-handle'
const SWIPE_EDGE_PX = 30
const DIRECTION_LOCK_PX = 7
const OPEN_PROGRESS_THRESHOLD = 0.48
const FLING_VELOCITY_PX_MS = 0.42

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

const setInteractiveDrawerPosition = (shell, width, progress) => {
  const normalized = clamp(progress, 0, 1)
  const offset = (normalized - 1) * width
  shell.style.setProperty('--en-mobile-drawer-offset', `${offset}px`)
  shell.style.setProperty('--en-mobile-drawer-progress', String(normalized))
}

const clearInteractiveDrawerPosition = (shell) => {
  shell.style.removeProperty('--en-mobile-drawer-offset')
  shell.style.removeProperty('--en-mobile-drawer-progress')
  shell.classList.remove('en-mobile-drawer-dragging', 'en-mobile-drawer-settling')
}

const createEdgeHandle = (target) => {
  const existing = target.document.querySelector(`.${EDGE_HANDLE_CLASS}`)
  if (existing) return existing
  const handle = target.document.createElement('div')
  handle.className = EDGE_HANDLE_CLASS
  handle.style.width = `${SWIPE_EDGE_PX}px`
  handle.setAttribute('aria-hidden', 'true')
  target.document.body.appendChild(handle)
  return handle
}

const installDrawerGestures = (target = globalThis) => {
  const edgeHandle = createEdgeHandle(target)
  let gesture = null
  let moveFrame = 0
  let pendingProgress = null

  const syncEdgeHandle = () => {
    const available = isMobileViewport(target) && !!getShell(target) && !isDrawerOpen(target)
    edgeHandle.style.pointerEvents = available ? 'auto' : 'none'
    edgeHandle.style.display = available ? 'block' : 'none'
  }

  const flushMove = () => {
    moveFrame = 0
    if (!gesture || pendingProgress == null) return
    gesture.progress = pendingProgress
    setInteractiveDrawerPosition(gesture.shell, gesture.width, gesture.progress)
    pendingProgress = null
  }

  const cancelMoveFrame = () => {
    if (moveFrame) target.cancelAnimationFrame(moveFrame)
    moveFrame = 0
    pendingProgress = null
  }

  const reset = () => {
    cancelMoveFrame()
    if (gesture?.shell) clearInteractiveDrawerPosition(gesture.shell)
    gesture = null
    syncEdgeHandle()
  }

  const beginGesture = (event, drawerOpen) => {
    if (!isMobileViewport(target) || event.isPrimary === false || event.button > 0) return
    const shell = getShell(target)
    const sidebar = getSidebar(target)
    if (!shell || !sidebar) return

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
      locked: false
    }
    shell.classList.add('en-mobile-drawer-dragging')
    setInteractiveDrawerPosition(shell, width, gesture.progress)
    try {
      event.currentTarget?.setPointerCapture?.(event.pointerId)
      event.target?.setPointerCapture?.(event.pointerId)
    } catch {
      // Document listeners still maintain the gesture when a WebView refuses capture.
    }
  }

  const onEdgePointerDown = (event) => {
    if (isDrawerOpen(target)) return
    beginGesture(event, false)
  }

  const onDocumentPointerDown = (event) => {
    if (!isDrawerOpen(target) || gesture) return
    const sidebar = getSidebar(target)
    if (!sidebar) return
    const sidebarRect = sidebar.getBoundingClientRect()
    const insideDrawer = event.clientX >= sidebarRect.left && event.clientX <= sidebarRect.right
    const onScrim = !!event.target?.closest?.('.en-mobile-scrim.visible')
    if (!insideDrawer && !onScrim) return
    beginGesture(event, true)
  }

  const onPointerMove = (event) => {
    if (!gesture || event.pointerId !== gesture.pointerId) return
    const dx = event.clientX - gesture.startX
    const dy = event.clientY - gesture.startY

    if (!gesture.locked) {
      if (Math.abs(dx) < DIRECTION_LOCK_PX && Math.abs(dy) < DIRECTION_LOCK_PX) return
      if (Math.abs(dy) > Math.abs(dx) * 1.15) {
        reset()
        return
      }
      gesture.locked = true
    }

    event.preventDefault()
    const now = performance.now()
    const elapsed = Math.max(1, now - gesture.lastAt)
    const instantaneousVelocity = (event.clientX - gesture.lastX) / elapsed
    gesture.velocityX = gesture.velocityX * 0.65 + instantaneousVelocity * 0.35
    gesture.lastX = event.clientX
    gesture.lastAt = now

    const progress = gesture.drawerOpen
      ? 1 + Math.min(0, dx) / gesture.width
      : Math.max(0, dx) / gesture.width
    pendingProgress = clamp(progress, 0, 1)
    if (!moveFrame) moveFrame = target.requestAnimationFrame(flushMove)
  }

  const settle = (event) => {
    if (!gesture || (event?.pointerId != null && event.pointerId !== gesture.pointerId)) return
    if (moveFrame) flushMove()
    const current = gesture
    gesture = null

    if (!current.locked) {
      clearInteractiveDrawerPosition(current.shell)
      syncEdgeHandle()
      return
    }

    const shouldOpen = current.velocityX > FLING_VELOCITY_PX_MS ||
      (current.velocityX >= -FLING_VELOCITY_PX_MS && current.progress >= OPEN_PROGRESS_THRESHOLD)
    current.shell.classList.remove('en-mobile-drawer-dragging')
    current.shell.classList.add('en-mobile-drawer-settling')
    setInteractiveDrawerPosition(current.shell, current.width, shouldOpen ? 1 : 0)

    if (shouldOpen) openDrawer(target)
    else closeDrawer(target)

    target.setTimeout(() => {
      clearInteractiveDrawerPosition(current.shell)
      syncEdgeHandle()
    }, 260)
  }

  edgeHandle.addEventListener('pointerdown', onEdgePointerDown, { passive: true })
  target.document.addEventListener('pointerdown', onDocumentPointerDown, { passive: true })
  target.document.addEventListener('pointermove', onPointerMove, { passive: false })
  target.document.addEventListener('pointerup', settle, { passive: true })
  target.document.addEventListener('pointercancel', settle, { passive: true })
  target.addEventListener('resize', syncEdgeHandle)

  const shellObserver = new target.MutationObserver(syncEdgeHandle)
  shellObserver.observe(target.document.documentElement, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ['class']
  })
  syncEdgeHandle()

  return () => {
    edgeHandle.removeEventListener('pointerdown', onEdgePointerDown)
    target.document.removeEventListener('pointerdown', onDocumentPointerDown)
    target.document.removeEventListener('pointermove', onPointerMove)
    target.document.removeEventListener('pointerup', settle)
    target.document.removeEventListener('pointercancel', settle)
    target.removeEventListener('resize', syncEdgeHandle)
    shellObserver.disconnect()
    edgeHandle.remove()
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
  if (!target?.document || target.__ELEPHANT_MOBILE_INTERACTIONS_INSTALLED__) return false

  const installWhenMounted = () => {
    if (!getShell(target)) return false

    target.__ELEPHANT_MOBILE_INTERACTIONS_INSTALLED__ = true
    const removeGestures = installDrawerGestures(target)
    const removeBackNavigation = installAndroidBackNavigation(target)

    target.__ELEPHANT_MOBILE_INTERACTIONS_DISPOSE__ = () => {
      removeGestures()
      removeBackNavigation()
      target.__ELEPHANT_MOBILE_INTERACTIONS_INSTALLED__ = false
    }
    console.info('[mobile-navigation] native edge drawer and Android back navigation installed')
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
