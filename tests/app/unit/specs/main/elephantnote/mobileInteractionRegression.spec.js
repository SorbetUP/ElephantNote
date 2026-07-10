import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8')

describe('Elephant mobile interaction regressions', () => {
  it('keeps folder expansion distinct from folder navigation', () => {
    const treeEntry = read('Elephant/frontend/app/components/navigation/SidebarTreeEntry.vue')
    const css = read('Elephant/frontend/src/renderer/src/mobile-native-ux.css')
    const shell = read('Elephant/frontend/app/components/shell/AppShell.vue')

    expect(treeEntry).toContain('class="en-sidebar-tree-toggle"')
    expect(treeEntry).toContain('role="button"')
    expect(treeEntry).toContain('@click.stop="toggleExpanded"')
    expect(treeEntry).toContain('@keydown.enter.stop.prevent="toggleExpanded"')
    expect(treeEntry).toContain('class="en-sidebar-tree-label"')
    expect(treeEntry).toContain('@click.stop="openFolder"')
    expect(css).toContain('width: 46px !important')
    expect(shell).toContain('.en-sidebar-tree-toggle, .en-recent-heading, .en-recent-more, [aria-expanded]')
  })

  it('drives the drawer continuously from one Vue-owned progress value', () => {
    const runtime = read('Elephant/frontend/src/renderer/src/platform/mobileInteractionRuntime.js')
    const shell = read('Elephant/frontend/app/components/shell/AppShell.vue')
    const nativeCss = read('Elephant/frontend/src/renderer/src/mobile-native-ux.css')
    const html = read('Elephant/frontend/src/renderer/index.html')

    expect(shell).toContain('const drawerProgress = ref(1)')
    expect(shell).toContain('handleDrawerPointerDown')
    expect(shell).toContain('handleDrawerPointerMove')
    expect(shell).toContain('handleDrawerPointerEnd')
    expect(shell).toContain('event.clientX > 30')
    expect(shell).toContain('gesture.velocityX')
    expect(shell).toContain("gesture.axis = 'x'")
    expect(shell).toContain("'--en-mobile-drawer-progress': String(drawerProgress.value)")
    expect(nativeCss).toContain('var(--en-mobile-drawer-progress, 0)')
    expect(nativeCss).toContain('transition: none !important')
    expect(runtime).not.toContain('MutationObserver')
    expect(runtime).not.toContain('createEdgeHandle')
    expect(runtime).not.toContain('--en-mobile-drawer-offset')
    expect(html).toContain('/src/platform/mobileInteractionRuntime.js')
  })

  it('keeps Android back navigation inside the application', () => {
    const runtime = read('Elephant/frontend/src/renderer/src/platform/mobileInteractionRuntime.js')

    expect(runtime).toContain("addEventListener('popstate'")
    expect(runtime).toContain('vaultStore.closeNote()')
    expect(runtime).toContain('navigationStore.back()')
    expect(runtime).toContain('vaultStore.navigateTo(previous)')
    expect(runtime).toContain("target.document.querySelector('.en-settings-close')")
  })

  it('provides real editor actions and keeps them above the Android keyboard', () => {
    const runtime = read('Elephant/frontend/src/renderer/src/platform/mobileEditorRuntime.js')
    const noteActions = read('Elephant/frontend/src/renderer/src/platform/mobileNoteActionsRuntime.js')
    const css = read('Elephant/frontend/src/renderer/src/mobile-editor-round2.css')
    const html = read('Elephant/frontend/src/renderer/index.html')

    expect(runtime).toContain('requestCameraStream')
    expect(runtime.indexOf('stream = await requestCameraStream')).toBeLessThan(runtime.indexOf('document.body.appendChild(backdrop)'))
    expect(runtime).toContain("input.accept = 'image/*'")
    expect(runtime).not.toContain('input.capture =')
    expect(runtime).toContain("bus.emit('insert-image', destination)")
    expect(runtime).toContain("iconName: 'h1'")
    expect(runtime).toContain("iconName: 'bold'")
    expect(runtime).toContain("action: 'share-note'")
    expect(runtime).toContain("action: 'duplicate-note'")
    expect(runtime).toContain("action: 'manage-tags'")
    expect(runtime).toContain('target.visualViewport')
    expect(runtime).toContain('--en-mobile-keyboard-offset')
    expect(noteActions).toContain('duplicateCurrentNote')
    expect(noteActions).toContain('en-mobile-tag-manager-backdrop')
    expect(noteActions).toContain("new MouseEvent('contextmenu'")
    expect(css).toContain('var(--en-mobile-keyboard-offset, 0px)')
    expect(css).toContain('.en-mobile-tag-manager')
    expect(html).toContain('/src/platform/mobileEditorRuntime.js')
    expect(html).toContain('/src/platform/mobileNoteActionsRuntime.js')
  })

  it('keeps tag submission inside the note and removes the redundant cancel button', () => {
    const form = read('Elephant/frontend/app/components/editor/NoteTagForm.vue')
    const topbar = read('Elephant/frontend/app/components/editor/NoteEditorTopBar.vue')

    expect(form).toContain('@submit.stop.prevent="submit"')
    expect(form).toContain('@keydown.enter.stop.prevent="submit"')
    expect(form).toContain('enterkeyhint="done"')
    expect(form).not.toContain('Cancel\n')
    expect(topbar).toContain('window.addEventListener(\'pointerdown\', closeOnOutsideClick)')
    expect(topbar).toContain('<ArrowLeft class="en-icon" />')
    expect(topbar).toContain('@keydown.enter.stop.prevent="$event.target.blur()"')
  })

  it('separates pinned notes from other entries in grid and list modes', () => {
    const library = read('Elephant/frontend/app/components/library/LibraryGrid.vue')
    const mobileCss = read('Elephant/frontend/src/renderer/src/mobile-android.css')

    expect(library).toContain('Notes épinglées')
    expect(library).toContain('Autres')
    expect(library).toContain('const pinnedEntries = computed')
    expect(library).toContain('const otherEntries = computed')
    expect(library).toContain('.en-library-section-grid')
    expect(library).toContain('.en-library-grid.list .en-library-section-grid')
    expect(mobileCss).toContain('.en-library-grid.list .en-note-card')
    expect(mobileCss).toContain('min-height: 76px !important')
  })

  it('updates library header icons only when the layout mode changes', () => {
    const runtime = read('Elephant/frontend/src/renderer/src/platform/mobileLibraryChromeRuntime.js')

    expect(runtime).toContain('const desiredIcon =')
    expect(runtime).toContain('viewButton.dataset.icon')
    expect(runtime).toContain('if (viewButton.dataset.icon !== desiredIcon)')
    expect(runtime).toContain('viewButton.innerHTML = svg(desiredIcon)')
  })

  it('uses minimal Excalidraw application chrome', () => {
    const css = read('Elephant/frontend/src/renderer/src/mobile-editor-round2.css')
    const dialog = read('Elephant/frontend/app/components/editor/ExcalidrawDialog.vue')

    expect(css).toContain('.en-excalidraw-name-wrap')
    expect(css).toContain('display: none !important')
    expect(css).toContain('width: 28px !important')
    expect(dialog).toContain('aria-label="Cancel"')
    expect(dialog).toContain('aria-label="Save"')
  })

  it('removes desktop-only mobile chrome and preserves the Android launcher icon', () => {
    const mobileCss = read('Elephant/frontend/src/renderer/src/mobile-android.css')
    const nativeCss = read('Elephant/frontend/src/renderer/src/mobile-native-ux.css')
    const buildScript = read('build/scripts/build_dev_apk.sh')

    expect(mobileCss).toContain('.en-site-preview-panel')
    expect(mobileCss).toContain('.en-settings-nav > button:nth-of-type(6)')
    expect(mobileCss).toContain('*::-webkit-scrollbar')
    expect(mobileCss).toContain('scrollbar-width: none !important')
    expect(nativeCss).toContain(':has(.en-main.has-editor-open) .en-mobile-topbar')
    expect(buildScript).toContain('ANDROID_ICON_SOURCE="$ROOT_DIR/Elephant/assets/static/icon.png"')
    expect(buildScript).toContain('drawable-nodpi/elephantnote_launcher.png')
    expect(buildScript).toContain('android:icon="@drawable/elephantnote_launcher"')
    expect(buildScript).toContain('android:roundIcon="@drawable/elephantnote_launcher"')
    expect(buildScript).toContain('install_android_launcher_icon')
  })
})
