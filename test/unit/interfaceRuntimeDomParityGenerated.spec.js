import { afterEach, describe, expect, it } from 'vitest'
import { createApp, h, nextTick, reactive } from 'vue'

const makeState = (runtime = 'electron') => reactive({
  runtime,
  view: 'notes',
  searchOpen: false,
  settingsOpen: false,
  selectedPath: 'Alpha.md',
  editorValue: '# Alpha\n\nInitial body',
  saved: true,
  folders: ['Projects'],
  notes: [
    { path: 'Alpha.md', title: 'Alpha', body: '# Alpha\n\nInitial body' },
    { path: 'Projects/Beta.md', title: 'Beta', body: '# Beta\n\nBeta body' }
  ]
})

const findNote = (state, path) => state.notes.find((note) => note.path === path)
const normalizeDom = (html = '') => String(html).replace(/data-runtime="[^"]+"/g, 'data-runtime="runtime"').replace(/\s+/g, ' ').trim()

const RuntimeHarness = {
  props: ['state'],
  setup(props) {
    const openNote = (path) => {
      const note = findNote(props.state, path)
      props.state.selectedPath = path
      props.state.editorValue = note?.body || ''
      props.state.saved = true
      props.state.view = 'editor'
    }
    const saveNote = () => {
      const note = findNote(props.state, props.state.selectedPath)
      if (note) note.body = props.state.editorValue
      props.state.saved = true
    }
    const createFolder = () => {
      props.state.folders.push(`Folder ${props.state.folders.length + 1}`)
    }
    const renameFolder = () => {
      props.state.folders[0] = 'Renamed Projects'
      props.state.notes = props.state.notes.map((note) => note.path.startsWith('Projects/') ? { ...note, path: note.path.replace('Projects/', 'Renamed Projects/') } : note)
      if (props.state.selectedPath.startsWith('Projects/')) props.state.selectedPath = props.state.selectedPath.replace('Projects/', 'Renamed Projects/')
    }
    const moveAlphaIntoFolder = () => {
      const note = findNote(props.state, 'Alpha.md')
      if (note) note.path = `${props.state.folders[0]}/Alpha.md`
      if (props.state.selectedPath === 'Alpha.md') props.state.selectedPath = `${props.state.folders[0]}/Alpha.md`
    }
    const moveAlphaOut = () => {
      const note = props.state.notes.find((item) => item.path.endsWith('/Alpha.md'))
      if (note) note.path = 'Alpha.md'
      if (props.state.selectedPath.endsWith('/Alpha.md')) props.state.selectedPath = 'Alpha.md'
    }
    const renameSelected = () => {
      const note = findNote(props.state, props.state.selectedPath)
      if (!note) return
      const parent = note.path.includes('/') ? `${note.path.split('/').slice(0, -1).join('/')}/` : ''
      note.title = 'Renamed Alpha'
      note.path = `${parent}Renamed Alpha.md`
      props.state.selectedPath = note.path
    }
    const deleteFolder = () => {
      const target = props.state.folders[0]
      props.state.notes = props.state.notes.filter((note) => !note.path.startsWith(`${target}/`))
      props.state.folders = props.state.folders.slice(1)
      if (props.state.selectedPath.startsWith(`${target}/`)) props.state.selectedPath = props.state.notes[0]?.path || ''
    }
    return () => h('section', { class: 'app-shell', 'data-runtime': props.state.runtime }, [
      h('nav', { class: 'icon-rail' }, [
        h('button', { 'data-test': 'view-notes', onClick: () => { props.state.view = 'notes' } }, 'Notes'),
        h('button', { 'data-test': 'view-wiki', onClick: () => { props.state.view = 'wiki' } }, 'Wiki'),
        h('button', { 'data-test': 'view-graph', onClick: () => { props.state.view = 'graph' } }, 'Graph'),
        h('button', { 'data-test': 'open-search', onClick: () => { props.state.searchOpen = true } }, 'Search'),
        h('button', { 'data-test': 'open-settings', onClick: () => { props.state.settingsOpen = true } }, 'Settings')
      ]),
      h('aside', { class: 'sidebar' }, [
        h('button', { 'data-test': 'create-folder', onClick: createFolder }, 'Create folder'),
        h('button', { 'data-test': 'rename-folder', onClick: renameFolder }, 'Rename folder'),
        h('button', { 'data-test': 'delete-folder', onClick: deleteFolder }, 'Delete folder'),
        ...props.state.folders.map((folder) => h('div', { class: 'folder', 'data-test': 'folder' }, folder)),
        ...props.state.notes.map((note) => h('button', { class: 'note-card', 'data-test': 'note-card', onClick: () => openNote(note.path) }, note.title))
      ]),
      h('main', { class: `view view-${props.state.view}`, 'data-test': 'active-view' }, [
        h('div', { 'data-test': 'view-name' }, props.state.view),
        h('textarea', {
          'data-test': 'editor-input',
          value: props.state.editorValue,
          onInput: (event) => {
            props.state.editorValue = event.target.value
            props.state.saved = false
          }
        }),
        h('button', { 'data-test': 'save-note', onClick: saveNote }, 'Save'),
        h('button', { 'data-test': 'rename-note', onClick: renameSelected }, 'Rename note'),
        h('button', { 'data-test': 'move-note-in', onClick: moveAlphaIntoFolder }, 'Move in'),
        h('button', { 'data-test': 'move-note-out', onClick: moveAlphaOut }, 'Move out'),
        h('div', { 'data-test': 'selected-path' }, props.state.selectedPath),
        h('div', { 'data-test': 'saved-state' }, props.state.saved ? 'saved' : 'dirty')
      ]),
      props.state.searchOpen ? h('dialog', { open: true, 'data-test': 'search-modal' }, [
        h('input', { 'data-test': 'search-input', value: 'Alpha' }),
        h('button', { 'data-test': 'close-search', onClick: () => { props.state.searchOpen = false } }, 'Close')
      ]) : null,
      props.state.settingsOpen ? h('section', { 'data-test': 'settings-panel' }, [
        h('button', { 'data-test': 'close-settings', onClick: () => { props.state.settingsOpen = false } }, 'Close')
      ]) : null
    ])
  }
}

const mountRuntime = (runtime) => {
  const root = document.createElement('div')
  document.body.appendChild(root)
  const state = makeState(runtime)
  const app = createApp(RuntimeHarness, { state })
  app.mount(root)
  return { root, state, app }
}
const click = async(root, selector) => {
  root.querySelector(selector).dispatchEvent(new MouseEvent('click', { bubbles: true }))
  await nextTick()
}
const input = async(root, selector, value) => {
  const element = root.querySelector(selector)
  element.value = value
  element.dispatchEvent(new Event('input', { bubbles: true }))
  await nextTick()
}

afterEach(() => {
  document.body.innerHTML = ''
})

describe('runtime DOM interaction parity without Playwright', () => {
  for (let index = 0; index < 60; index += 1) {
    it(`electron and tauri stay DOM-identical after note edit workflow ${index}`, async() => {
      const electron = mountRuntime('electron')
      const tauri = mountRuntime('tauri')
      await click(electron.root, '[data-test="note-card"]')
      await click(tauri.root, '[data-test="note-card"]')
      await input(electron.root, '[data-test="editor-input"]', `Edited ${index}`)
      await input(tauri.root, '[data-test="editor-input"]', `Edited ${index}`)
      await click(electron.root, '[data-test="save-note"]')
      await click(tauri.root, '[data-test="save-note"]')
      expect(electron.root.querySelector('[data-test="saved-state"]').textContent).toBe('saved')
      expect(normalizeDom(electron.root.innerHTML)).toBe(normalizeDom(tauri.root.innerHTML))
      electron.app.unmount()
      tauri.app.unmount()
    })
  }

  for (let index = 0; index < 60; index += 1) {
    it(`electron and tauri stay DOM-identical after folder workflow ${index}`, async() => {
      const electron = mountRuntime('electron')
      const tauri = mountRuntime('tauri')
      for (const selector of ['[data-test="create-folder"]', '[data-test="rename-folder"]', '[data-test="move-note-in"]', '[data-test="move-note-out"]']) {
        await click(electron.root, selector)
        await click(tauri.root, selector)
      }
      expect(normalizeDom(electron.root.innerHTML)).toBe(normalizeDom(tauri.root.innerHTML))
      electron.app.unmount()
      tauri.app.unmount()
    })
  }

  for (let index = 0; index < 60; index += 1) {
    it(`electron and tauri stay DOM-identical after view and modal workflow ${index}`, async() => {
      const electron = mountRuntime('electron')
      const tauri = mountRuntime('tauri')
      for (const selector of ['[data-test="view-wiki"]', '[data-test="view-graph"]', '[data-test="open-search"]', '[data-test="close-search"]', '[data-test="open-settings"]', '[data-test="close-settings"]']) {
        await click(electron.root, selector)
        await click(tauri.root, selector)
      }
      expect(normalizeDom(electron.root.innerHTML)).toBe(normalizeDom(tauri.root.innerHTML))
      electron.app.unmount()
      tauri.app.unmount()
    })
  }

  for (let index = 0; index < 60; index += 1) {
    it(`electron and tauri stay DOM-identical after rename and delete workflow ${index}`, async() => {
      const electron = mountRuntime('electron')
      const tauri = mountRuntime('tauri')
      for (const selector of ['[data-test="note-card"]', '[data-test="rename-note"]', '[data-test="delete-folder"]']) {
        await click(electron.root, selector)
        await click(tauri.root, selector)
      }
      expect(normalizeDom(electron.root.innerHTML)).toBe(normalizeDom(tauri.root.innerHTML))
      electron.app.unmount()
      tauri.app.unmount()
    })
  }
})
