import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8')


describe('declarative addon workspace views', () => {
  it('keeps external view code in the Worker and exposes state/action RPC only', () => {
    const runtime = read('Elephant/frontend/src/renderer/src/addons/externalAddonRuntime.js')

    expect(runtime).toContain('const views = new Map();')
    expect(runtime).toContain("type: 'register-view'")
    expect(runtime).toContain("message.type === 'view-state'")
    expect(runtime).toContain("message.type === 'view-action'")
    expect(runtime).toContain('this.context.addView({')
    expect(runtime).toContain("getState: (params) => this.request('view-state'")
    expect(runtime).toContain("dispatch: (action, params) => this.request('view-action'")
    expect(runtime).not.toContain('innerHTML')
    expect(runtime).not.toContain('v-html')
  })

  it('requires every external view to match a manifest declaration', () => {
    const runtime = read('Elephant/frontend/src/renderer/src/addons/externalAddonRuntime.js')
    const validator = read('build/scripts/validate-addon-catalog.mjs')

    expect(runtime).toContain('const declaredViews = Array.isArray(this.record.manifest.contributes?.views)')
    expect(runtime).toContain("entry?.id === id && entry?.kind === view.kind")
    expect(runtime).toContain('external addon attempted to register an undeclared view')
    expect(validator).toContain('registered views do not match manifest contributions')
  })

  it('routes trusted task and calendar schemas without accepting addon HTML', () => {
    const taskHost = read('Elephant/frontend/app/components/views/AddonWorkspaceHost.vue')
    const router = read('Elephant/frontend/app/components/views/AddonWorkspaceRouter.vue')
    const calendarHost = read('Elephant/frontend/app/components/views/CalendarAddonWorkspace.vue')
    const main = read('Elephant/frontend/app/components/shell/MainContent.vue')
    const sidebar = read('Elephant/frontend/app/components/navigation/SidebarNav.vue')
    const shell = read('Elephant/frontend/app/components/shell/AppShell.vue')

    expect(taskHost).toContain('contribution.getState')
    expect(taskHost).toContain('contribution.dispatch')
    expect(taskHost).not.toContain('v-html')
    expect(router).toContain("view.contribution.kind === 'task-manager-v1'")
    expect(router).toContain("view.contribution.kind === 'calendar-v1'")
    expect(calendarHost).toContain('props.view?.contribution?.getState')
    expect(calendarHost).toContain('props.view?.contribution?.dispatch')
    expect(calendarHost).not.toContain('v-html')
    expect(main).toContain('<addon-workspace-router')
    expect(sidebar).toContain("addonsStore.getContributions('views')")
    expect(shell).toContain('@open-addon-view="openAddonView"')
  })

  it('keeps the Things-like workflow in the installable catalogue addon', () => {
    const workflow = read('build/scripts/test-elephant-tasks-v2.mjs')
    const catalogWorkflow = read('.github/workflows/addon-platform-validation.yml')

    expect(workflow).toContain('future start dates must stay out of Anytime')
    expect(workflow).toContain('after-completion recurrence must create a separate future occurrence')
    expect(workflow).toContain('manual Today must override a future start date')
    expect(workflow).toContain('Area must include tasks inherited through its Project')
    expect(workflow).toContain('view actions must preserve the current list context')
    expect(catalogWorkflow).toContain('test-elephant-tasks-v2.mjs addon-catalog-source')
  })
})
