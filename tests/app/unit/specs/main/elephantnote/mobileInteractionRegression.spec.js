import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8')

describe('ElephantNote mobile interaction regressions', () => {
  it('keeps folder expansion distinct from folder navigation', () => {
    const runtime = read('Elephant/frontend/src/renderer/src/platform/mobileInteractionRuntime.js')
    const treeEntry = read('Elephant/frontend/app/components/navigation/SidebarTreeEntry.vue')
    const css = read('Elephant/frontend/src/renderer/src/mobile-native-ux.css')

    expect(runtime).toContain('.en-sidebar-tree-toggle')
    expect(runtime).toContain('.en-recent-heading')
    expect(runtime).toContain('preserveDrawerForLocalToggle')
    expect(treeEntry).toContain('class="en-sidebar-tree-toggle"')
    expect(treeEntry).toContain('role="button"')
    expect(treeEntry).toContain('@click.stop="toggleExpanded"')
    expect(treeEntry).toContain('@keydown.enter.stop.prevent="toggleExpanded"')
    expect(treeEntry).toContain('class="en-sidebar-tree-label"')
    expect(treeEntry).toContain('@click.stop="openFolder"')
    expect(css).toContain('width: 46px !important')
  })

  it('drives the drawer continuously from an edge-only pointer gesture', () => {
    const runtime = read('Elephant/frontend/src/renderer/src/platform/mobileInteractionRuntime.js')
    const css = read('Elephant/frontend/src/renderer/src/mobile-native-ux.css')
    const html = read('Elephant/frontend/src/renderer/index.html')

    expect(runtime).toContain('const SWIPE_EDGE_PX = 24')
    expect(runtime).toContain("addEventListener('pointerdown'")
    expect(runtime).toContain("addEventListener('pointermove'")
    expect(runtime).toContain("addEventListener('pointerup'")
    expect(runtime).toContain('--en-mobile-drawer-offset')
    expect(runtime).toContain('--en-mobile-drawer-progress')
    expect(runtime).toContain('en-mobile-drawer-dragging')
    expect(runtime).toContain('velocityX')
    expect(css).toContain('translate3d(var(--en-mobile-drawer-offset')
    expect(css).toContain('transition: none !important')
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

  it('provides a mobile-native editor toolbar without Android capture inputs', () => {
    const runtime = read('Elephant/frontend/src/renderer/src/platform/mobileEditorRuntime.js')
    const css = read('Elephant/frontend/src/renderer/src/mobile-native-ux.css')
    const html = read('Elephant/frontend/src/renderer/index.html')

    expect(runtime).toContain('navigator.mediaDevices.getUserMedia')
    expect(runtime).toContain("input.accept = 'image/*'")
    expect(runtime).not.toContain('input.capture =')
    expect(runtime).toContain("bus.emit('insert-image', destination)")
    expect(runtime).toContain("action: 'excalidraw'")
    expect(runtime).toContain("action: 'tasks'")
    expect(runtime).toContain("action: 'heading-1'")
    expect(runtime).toContain('bus.emit(action)')
    expect(css).toContain('.en-mobile-editor-toolbar')
    expect(css).toContain('.en-mobile-camera-backdrop')
    expect(html).toContain('/src/platform/mobileEditorRuntime.js')
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
