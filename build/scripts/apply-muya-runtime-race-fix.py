from pathlib import Path
import re
from textwrap import dedent


adapter_path = Path('Elephant/frontend/src/renderer/src/muya/realMuyaRustAdapter.js')
adapter = adapter_path.read_text()

import_line = "import Muya from '../../../muya/lib'\n"
guard_import = "import { createProgrammaticChangeGuard } from './rustProgrammaticChangeGuard.js'\n"
if guard_import not in adapter:
    if adapter.count(import_line) != 1:
        raise SystemExit('Muya import is not unique')
    adapter = adapter.replace(import_line, import_line + guard_import, 1)

constructor_line = '    this.__rustExpectedMarkdown = null\n'
if adapter.count(constructor_line) != 3:
    raise SystemExit('expected constructor, listener and external reset markers')
adapter = adapter.replace(
    constructor_line,
    '    this.__rustProgrammaticChanges = this.__rustProgrammaticChanges || createProgrammaticChangeGuard()\n',
    1,
)

expected_block = (
    '      if (this.__rustExpectedMarkdown === markdown) {\n'
    '        this.__rustExpectedMarkdown = null\n'
    '        return\n'
    '      }\n'
)
if adapter.count(expected_block) != 1:
    raise SystemExit('legacy expected-markdown listener block is not unique')
adapter = adapter.replace(
    expected_block,
    '      if (this.__programmaticGuard().consume()) return\n',
    1,
)

old_error = "      console.error('[elephantnote:muya-rust] rejected non-canonical JavaScript mutation')\n"
new_error = (
    "      console.error('[elephantnote:muya-rust] rejected non-canonical JavaScript mutation', {\n"
    '        canonicalLength: state.markdown.length,\n'
    '        receivedLength: markdown.length,\n'
    '        revision: state.revision\n'
    '      })\n'
)
if adapter.count(old_error) != 1:
    raise SystemExit('legacy rejection log is not unique')
adapter = adapter.replace(old_error, new_error, 1)

state_assignment = '      this.__rustExpectedMarkdown = state.markdown\n'
if adapter.count(state_assignment) != 2:
    raise SystemExit('expected exactly two Rust render state assignments')
adapter = adapter.replace(state_assignment, '')

external_clear = '    this.__rustExpectedMarkdown = null\n'
if adapter.count(external_clear) != 1:
    raise SystemExit('expected exactly one external expected-markdown clear')
adapter = adapter.replace(external_clear, '', 1)

old_super_calls = adapter.count('super.setMarkdown(')
if old_super_calls != 3:
    raise SystemExit(f'expected three historical super.setMarkdown calls, found {old_super_calls}')
adapter = adapter.replace('super.setMarkdown(', 'this.__setProgrammaticMarkdown(')

listener_anchor = (
    "    this.on('change', this.__rustChangeListener)\n"
    "    this.on('selectionChange', this.__rustSelectionListener)\n"
    '  }\n\n'
    '  __reportRustError = (error) => {\n'
)
helper_block = (
    "    this.on('change', this.__rustChangeListener)\n"
    "    this.on('selectionChange', this.__rustSelectionListener)\n"
    '  }\n\n'
    '  __programmaticGuard () {\n'
    '    if (!this.__rustProgrammaticChanges) {\n'
    '      this.__rustProgrammaticChanges = createProgrammaticChangeGuard()\n'
    '    }\n'
    '    return this.__rustProgrammaticChanges\n'
    '  }\n\n'
    '  __setProgrammaticMarkdown (markdown, cursor, isRenderCursor = true, muyaIndexCursor, blocks) {\n'
    '    return this.__programmaticGuard().run(() => super.setMarkdown(\n'
    '      markdown,\n'
    '      cursor,\n'
    '      isRenderCursor,\n'
    '      muyaIndexCursor,\n'
    '      blocks\n'
    '    ))\n'
    '  }\n\n'
    '  __reportRustError = (error) => {\n'
)
if adapter.count(listener_anchor) != 1:
    raise SystemExit('listener anchor for the programmatic guard is not unique')
adapter = adapter.replace(listener_anchor, helper_block, 1)

selection_guard = (
    '      if (!this.__rustMirror?.active || this.__rustApplying || '
    'this.__rustComposition) return\n'
)
if adapter.count(selection_guard) != 1:
    raise SystemExit('selection listener guard is not unique')
adapter = adapter.replace(
    selection_guard,
    '      if (!this.__rustMirror?.active || this.__rustApplying || '
    'this.__rustComposition || this.__programmaticGuard().pending) return\n',
    1,
)

apply_anchor = '    try {\n      const { markdown, cursor } = this.__selection()\n'
if adapter.count(apply_anchor) != 1:
    raise SystemExit('Rust apply anchor is not unique')
adapter = adapter.replace(
    apply_anchor,
    '    try {\n      await engine.flush()\n      const { markdown, cursor } = this.__selection()\n',
    1,
)

required = [
    guard_import.strip(),
    'this.__programmaticGuard().consume()',
    '__setProgrammaticMarkdown (markdown, cursor, isRenderCursor = true, muyaIndexCursor, blocks)',
    'await engine.flush()',
    'canonicalLength: state.markdown.length',
]
for marker in required:
    if marker not in adapter:
        raise SystemExit(f'missing final adapter invariant: {marker}')
if '__rustExpectedMarkdown' in adapter:
    raise SystemExit('legacy expected-markdown state remains after patch')
if adapter.count('super.setMarkdown(') != 1:
    raise SystemExit('only the guarded internal super.setMarkdown call may remain')
if adapter.count('this.__setProgrammaticMarkdown(') != 3:
    raise SystemExit('all three programmatic render paths must use the guard')
adapter_path.write_text(adapter)

guard_path = Path('Elephant/frontend/src/renderer/src/muya/rustProgrammaticChangeGuard.js')
if guard_path.exists():
    raise SystemExit(f'{guard_path} already exists')
guard_path.write_text(dedent('''\
export const createProgrammaticChangeGuard = () => {
  let pending = 0

  return {
    run (render) {
      if (typeof render !== 'function') throw new TypeError('A programmatic Muya render callback is required.')
      pending += 1
      try {
        return render()
      } catch (error) {
        pending = Math.max(0, pending - 1)
        throw error
      }
    },

    consume () {
      if (pending <= 0) return false
      pending -= 1
      return true
    },

    get pending () {
      return pending
    }
  }
}
'''))

test_path = Path('tests/app/unit/muyaRustProgrammaticLoad.spec.js')
if test_path.exists():
    raise SystemExit(f'{test_path} already exists')
test_path.write_text(dedent('''\
import { describe, expect, it, vi } from 'vitest'

import { createProgrammaticChangeGuard } from '../../../Elephant/frontend/src/renderer/src/muya/rustProgrammaticChangeGuard.js'

describe('Muya Rust programmatic render guard', () => {
  it('consumes consecutive deferred loads without hiding the next real mutation', () => {
    const guard = createProgrammaticChangeGuard()
    const render = vi.fn((markdown) => markdown.length)

    expect(guard.run(() => render('old note'))).toBe(8)
    expect(guard.run(() => render('x'.repeat(722)))).toBe(722)
    expect(guard.pending).toBe(2)
    expect(guard.consume()).toBe(true)
    expect(guard.consume()).toBe(true)
    expect(guard.pending).toBe(0)
    expect(guard.consume()).toBe(false)
    expect(render).toHaveBeenCalledTimes(2)
  })

  it('releases its slot when rendering throws', () => {
    const guard = createProgrammaticChangeGuard()
    expect(() => guard.run(() => { throw new Error('render failed') })).toThrow('render failed')
    expect(guard.pending).toBe(0)
    expect(guard.consume()).toBe(false)
  })
})
'''))

for rust_name in ['muya_advanced.rs', 'muya_surface.rs']:
    path = Path('Elephant/backend/tauri/src/markdown') / rust_name
    text = path.read_text()
    updated, count = re.subn(
        r'MuyaEditorTransaction,\s*MuyaSelection,',
        'MuyaEditorTransaction,',
        text,
        count=1,
    )
    if count != 1:
        raise SystemExit(f'unused MuyaSelection import is not unique in {path}')
    path.write_text(updated)
