#!/usr/bin/env python3
from pathlib import Path
import re

root = Path(__file__).resolve().parents[2]

def replace_once(text, old, new, label):
    if old not in text:
        raise SystemExit(f'Missing anchor: {label}')
    return text.replace(old, new, 1)

shell_path = root / 'Elephant/frontend/app/components/shell/AppShell.vue'
shell = shell_path.read_text()
shell = replace_once(
    shell,
    "        'en-mobile-drawer-open': isMobileShell && sidebarVisible\n",
    "        'en-mobile-drawer-open': isMobileShell && drawerProgress > 0,\n        'en-mobile-drawer-dragging': isMobileShell && drawerDragging,\n        'en-mobile-drawer-settling': isMobileShell && drawerSettling\n",
    'drawer classes',
)
shell = replace_once(
    shell,
    '    :style="shellStyle"\n  >',
    '    :style="shellStyle"\n    @pointerdown="handleDrawerPointerDown"\n    @pointermove="handleDrawerPointerMove"\n    @pointerup="handleDrawerPointerEnd"\n    @pointercancel="handleDrawerPointerCancel"\n  >',
    'shell pointer handlers',
)
shell = shell.replace(':class="{ visible: sidebarVisible }"', ':class="{ visible: drawerProgress > 0 }"', 1)
shell = shell.replace(':aria-hidden="!sidebarVisible"', ':aria-hidden="drawerProgress <= 0"', 1)
shell = shell.replace(':tabindex="sidebarVisible ? 0 : -1"', ':tabindex="drawerProgress > 0 ? 0 : -1"', 1)
shell = shell.replace('@click.capture="handleMobileSidebarClick"', '@click="handleMobileSidebarClick"', 1)
shell = replace_once(
    shell,
    'const sidebarVisible = ref(true)\n',
    'const sidebarVisible = ref(true)\nconst drawerProgress = ref(1)\nconst drawerDragging = ref(false)\nconst drawerSettling = ref(false)\nlet drawerGesture = null\nlet drawerSettleTimer = null\n',
    'drawer state',
)
shell = replace_once(
    shell,
    "  '--en-sidebar-width': `${sidebarWidth.value}px`\n",
    "  '--en-sidebar-width': `${sidebarWidth.value}px`,\n  '--en-mobile-drawer-progress': String(drawerProgress.value)\n",
    'drawer css variable',
)
old = '''const openMobileSidebar = () => {
  sidebarVisible.value = true
}

const closeMobileSidebar = () => {
  if (isMobileShell.value) sidebarVisible.value = false
}

const handleMobileSidebarClick = (event) => {
  if (!isMobileShell.value) return
  if (event.target?.closest?.('button')) {
    window.requestAnimationFrame(closeMobileSidebar)
  }
}
'''
new = '''const clampDrawerProgress = (value) => Math.min(1, Math.max(0, Number(value) || 0))
const drawerWidth = () => Math.max(
  1,
  document.querySelector('.en-mobile-shell .en-sidebar')?.getBoundingClientRect?.().width ||
    Math.min(window.innerWidth * 0.86, 340)
)

const settleDrawer = (open) => {
  window.clearTimeout(drawerSettleTimer)
  drawerDragging.value = false
  drawerSettling.value = true
  drawerProgress.value = open ? 1 : 0
  sidebarVisible.value = open
  drawerSettleTimer = window.setTimeout(() => {
    drawerSettling.value = false
  }, 280)
}

const openMobileSidebar = () => {
  if (!isMobileShell.value) return
  settleDrawer(true)
}

const closeMobileSidebar = () => {
  if (!isMobileShell.value) return
  settleDrawer(false)
}

const handleDrawerPointerDown = (event) => {
  if (!isMobileShell.value || event.isPrimary === false || event.button > 0 || drawerGesture) return
  const open = drawerProgress.value > 0
  const insideDrawer = !!event.target?.closest?.('.en-sidebar')
  const onScrim = !!event.target?.closest?.('.en-mobile-scrim.visible')
  if (!open && event.clientX > 30) return
  if (open && !insideDrawer && !onScrim) return

  window.clearTimeout(drawerSettleTimer)
  drawerSettling.value = false
  drawerDragging.value = true
  drawerGesture = {
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    lastX: event.clientX,
    lastAt: performance.now(),
    velocityX: 0,
    initialProgress: drawerProgress.value,
    axis: null
  }
  try {
    event.currentTarget?.setPointerCapture?.(event.pointerId)
  } catch {
    // Android WebView may decline capture; bubbled pointer events still continue.
  }
}

const handleDrawerPointerMove = (event) => {
  const gesture = drawerGesture
  if (!gesture || event.pointerId !== gesture.pointerId) return
  const dx = event.clientX - gesture.startX
  const dy = event.clientY - gesture.startY

  if (!gesture.axis) {
    if (Math.abs(dx) < 7 && Math.abs(dy) < 7) return
    if (Math.abs(dy) > Math.abs(dx) * 1.15) {
      drawerGesture = null
      drawerDragging.value = false
      drawerProgress.value = gesture.initialProgress
      return
    }
    gesture.axis = 'x'
  }

  event.preventDefault()
  const now = performance.now()
  const elapsed = Math.max(1, now - gesture.lastAt)
  const instantaneous = (event.clientX - gesture.lastX) / elapsed
  gesture.velocityX = gesture.velocityX * 0.65 + instantaneous * 0.35
  gesture.lastX = event.clientX
  gesture.lastAt = now
  drawerProgress.value = clampDrawerProgress(gesture.initialProgress + dx / drawerWidth())
}

const handleDrawerPointerEnd = (event) => {
  const gesture = drawerGesture
  if (!gesture || event.pointerId !== gesture.pointerId) return
  drawerGesture = null
  if (gesture.axis !== 'x') {
    drawerDragging.value = false
    drawerProgress.value = gesture.initialProgress
    return
  }
  const projected = drawerProgress.value + (gesture.velocityX * 180) / drawerWidth()
  settleDrawer(projected >= 0.5)
}

const handleDrawerPointerCancel = (event) => {
  const gesture = drawerGesture
  if (!gesture || event.pointerId !== gesture.pointerId) return
  drawerGesture = null
  drawerDragging.value = false
  drawerProgress.value = gesture.initialProgress
}

const handleMobileSidebarClick = (event) => {
  if (!isMobileShell.value) return
  if (event.target?.closest?.(
    '.en-sidebar-tree-toggle, .en-recent-heading, .en-recent-more, [aria-expanded]'
  )) return
  if (event.target?.closest?.('button, a, [role="button"]')) {
    window.requestAnimationFrame(closeMobileSidebar)
  }
}
'''
shell = replace_once(shell, old, new, 'drawer functions')
shell = replace_once(
    shell,
    '  if (isMobileShell.value && !wasMobile) {\n    sidebarVisible.value = false\n',
    '  if (isMobileShell.value && !wasMobile) {\n    sidebarVisible.value = false\n    drawerProgress.value = 0\n',
    'enter mobile',
)
shell = replace_once(
    shell,
    '  } else if (!isMobileShell.value && !sidebarVisible.value) {\n    sidebarVisible.value = true\n',
    '  } else if (!isMobileShell.value && !sidebarVisible.value) {\n    sidebarVisible.value = true\n    drawerProgress.value = 1\n',
    'leave mobile',
)
shell = replace_once(
    shell,
    'onBeforeUnmount(() => {\n',
    'onBeforeUnmount(() => {\n  window.clearTimeout(drawerSettleTimer)\n',
    'drawer cleanup',
)
shell_path.write_text(shell)

css_path = root / 'Elephant/frontend/src/renderer/src/mobile-native-ux.css'
css = css_path.read_text()
pattern = r"@media \(max-width: 760px\), \(hover: none\) and \(pointer: coarse\) \{\n.*?\n  \.en-sidebar-tree-row \{"
replacement = '''@media (max-width: 760px), (hover: none) and (pointer: coarse) {
  .en-mobile-shell .en-sidebar {
    transform: translate3d(calc((var(--en-mobile-drawer-progress, 0) - 1) * 100%), 0, 0) !important;
    transition: transform 260ms cubic-bezier(0.22, 1, 0.36, 1) !important;
    will-change: transform !important;
  }

  .en-mobile-shell .en-mobile-scrim {
    display: block !important;
    opacity: calc(var(--en-mobile-drawer-progress, 0) * 0.46) !important;
    pointer-events: none !important;
    transition: opacity 240ms ease !important;
  }

  .en-mobile-shell.en-mobile-drawer-open .en-mobile-scrim {
    pointer-events: auto !important;
  }

  .en-mobile-shell.en-mobile-drawer-dragging .en-sidebar,
  .en-mobile-shell.en-mobile-drawer-dragging .en-mobile-scrim {
    transition: none !important;
  }

  .en-mobile-shell {
    touch-action: pan-y;
  }

  .en-sidebar-tree-row {'''
css, count = re.subn(pattern, replacement, css, count=1, flags=re.S)
if count != 1:
    raise SystemExit('Unable to replace drawer CSS runtime block')
css_path.write_text(css)

print('Frontend drawer finalization complete')
