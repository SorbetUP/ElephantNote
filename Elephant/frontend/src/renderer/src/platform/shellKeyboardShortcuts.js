const INSTALL_FLAG = '__elephantShellKeyboardShortcutsInstalled'

const isSidebarShortcut = (event) => (
  (event.ctrlKey || event.metaKey) &&
  !event.altKey &&
  !event.shiftKey &&
  String(event.key || '').toLowerCase() === 'j'
)

if (typeof window !== 'undefined' && !window[INSTALL_FLAG]) {
  window[INSTALL_FLAG] = true
  window.addEventListener('keydown', (event) => {
    if (!isSidebarShortcut(event)) return
    const toggle = document.querySelector('.en-rail-sidebar-toggle')
    if (!(toggle instanceof HTMLElement)) return
    event.preventDefault()
    toggle.click()
  }, true)
}
