import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8')

describe('ElephantNote mobile interaction regressions', () => {
  it('keeps local sidebar toggles open while navigation actions still use the drawer', () => {
    const runtime = read('Elephant/frontend/src/renderer/src/platform/mobileInteractionRuntime.js')
    const shell = read('Elephant/frontend/app/components/shell/AppShell.vue')

    expect(runtime).toContain('.en-sidebar-tree-toggle')
    expect(runtime).toContain('.en-recent-heading')
    expect(runtime).toContain('preserveDrawerForLocalToggle')
    expect(runtime).toContain('target.queueMicrotask')
    expect(runtime).toContain('if (!isDrawerOpen(target)) openDrawer(target)')
    expect(shell).toContain('@click.capture="handleMobileSidebarClick"')
  })

  it('supports edge swipes and Android browser-back navigation', () => {
    const runtime = read('Elephant/frontend/src/renderer/src/platform/mobileInteractionRuntime.js')
    const html = read('Elephant/frontend/src/renderer/index.html')

    expect(runtime).toContain("addEventListener('touchstart'")
    expect(runtime).toContain("addEventListener('touchend'")
    expect(runtime).toContain('SWIPE_EDGE_PX')
    expect(runtime).toContain('SWIPE_DISTANCE_PX')
    expect(runtime).toContain("addEventListener('popstate'")
    expect(runtime).toContain('navigationStore.back()')
    expect(runtime).toContain('vaultStore.navigateTo(previous)')
    expect(runtime).toContain("target.document.querySelector('.en-settings-close')")
    expect(html).toContain('/src/platform/mobileInteractionRuntime.js')
  })

  it('makes list and grid modes visibly different and removes desktop-only mobile chrome', () => {
    const mobileCss = read('Elephant/frontend/src/renderer/src/mobile-android.css')

    expect(mobileCss).toContain('.en-library-grid:not(.list)')
    expect(mobileCss).toContain('.en-library-grid.list .en-note-card')
    expect(mobileCss).toContain('min-height: 76px !important')
    expect(mobileCss).toContain('.en-site-preview-panel')
    expect(mobileCss).toContain('.en-settings-nav > button:nth-of-type(6)')
    expect(mobileCss).toContain('*::-webkit-scrollbar')
    expect(mobileCss).toContain('scrollbar-width: none !important')
    expect(mobileCss).toContain('.en-settings-row:has(> .en-switch)')
  })

  it('forces the ElephantNote launcher asset into stale generated Android projects', () => {
    const buildScript = read('build/scripts/build_dev_apk.sh')

    expect(buildScript).toContain('ANDROID_ICON_SOURCE="$ROOT_DIR/Elephant/assets/static/icon.png"')
    expect(buildScript).toContain('drawable-nodpi/elephantnote_launcher.png')
    expect(buildScript).toContain('android:icon="@drawable/elephantnote_launcher"')
    expect(buildScript).toContain('android:roundIcon="@drawable/elephantnote_launcher"')
    expect(buildScript).toContain('install_android_launcher_icon')
  })
})
