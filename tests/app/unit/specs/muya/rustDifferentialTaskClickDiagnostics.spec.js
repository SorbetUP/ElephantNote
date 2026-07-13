import { afterEach, beforeAll, describe, expect, it } from 'vitest'

import {
  bundled,
  createJsEditor,
  initializeRustWasm,
  settle
} from './rustDifferentialHarness'

const describeBundled = bundled ? describe : describe.skip

const taskBoxes = (muya) =>
  Array.from(muya.container.querySelectorAll('input[type="checkbox"]'))

const clickTask = async (muya, index, checked) => {
  const checkbox = taskBoxes(muya)[index]
  if (!checkbox) throw new Error(`Task checkbox ${index} is unavailable.`)
  checkbox.checked = checked
  await muya.contentState.listItemCheckBoxClick(checkbox)
  await settle()
  return {
    markdown: muya.getMarkdown(),
    cursor: muya.contentState.cursor,
    checked: taskBoxes(muya).map((box) => box.checked)
  }
}

describeBundled('Muya task checkbox characterization', () => {
  let jsEditor = null

  beforeAll(initializeRustWasm)

  afterEach(() => {
    jsEditor?.destroy?.()
    jsEditor = null
    document.body.innerHTML = ''
  })

  it('checks an unchecked task', async () => {
    jsEditor = await createJsEditor('- [ ] alpha')
    const result = await clickTask(jsEditor, 0, true)
    console.log('[muya-task-click]', 'check', JSON.stringify(result))
    expect(result.markdown).toContain('alpha')
  })

  it('unchecks a checked task', async () => {
    jsEditor = await createJsEditor('- [x] alpha')
    const result = await clickTask(jsEditor, 0, false)
    console.log('[muya-task-click]', 'uncheck', JSON.stringify(result))
    expect(result.markdown).toContain('alpha')
  })

  it('does not propagate to nested tasks when autoCheck is disabled', async () => {
    jsEditor = await createJsEditor('- [ ] parent\n  - [ ] child')
    const result = await clickTask(jsEditor, 0, true)
    console.log('[muya-task-click]', 'default-no-propagation', JSON.stringify(result))
    expect(result.checked).toHaveLength(2)
  })

  it('propagates to descendants when autoCheck is enabled', async () => {
    jsEditor = await createJsEditor('- [ ] parent\n  - [ ] child')
    jsEditor.options.autoCheck = true
    const result = await clickTask(jsEditor, 0, true)
    console.log('[muya-task-click]', 'auto-check-descendants', JSON.stringify(result))
    expect(result.checked).toHaveLength(2)
  })
})
