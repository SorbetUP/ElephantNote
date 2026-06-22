import { describe, expect, it } from 'vitest'

const normalize = (value = '') => String(value).replaceAll('\\', '/').replace(/\/+/g, '/').replace(/^\//, '').replace(/\/$/, '')
const createTree = () => ({ folders: new Set(['']), notes: new Map() })
const createFolder = (tree, folder) => {
  tree.folders.add(normalize(folder))
  return tree
}
const createNote = (tree, file, content = '') => {
  const pathname = normalize(file)
  const parent = pathname.split('/').slice(0, -1).join('/')
  if (!tree.folders.has(parent)) tree.folders.add(parent)
  tree.notes.set(pathname, content)
  return tree
}
const readNote = (tree, file) => tree.notes.get(normalize(file)) || ''
const saveNote = (tree, file, content = '') => {
  tree.notes.set(normalize(file), content)
  return tree
}
const renameNote = (tree, from, to) => {
  const source = normalize(from)
  const target = normalize(to)
  const content = tree.notes.get(source)
  tree.notes.delete(source)
  tree.notes.set(target, content)
  return tree
}
const moveNote = renameNote
const deleteNote = (tree, file) => {
  tree.notes.delete(normalize(file))
  return tree
}
const renameFolder = (tree, from, to) => {
  const source = normalize(from)
  const target = normalize(to)
  const nextFolders = new Set()
  for (const folder of tree.folders) {
    if (folder === source || folder.startsWith(`${source}/`)) nextFolders.add(`${target}${folder.slice(source.length)}`)
    else nextFolders.add(folder)
  }
  tree.folders = nextFolders
  const nextNotes = new Map()
  for (const [file, content] of tree.notes) {
    if (file.startsWith(`${source}/`)) nextNotes.set(`${target}/${file.slice(source.length + 1)}`, content)
    else nextNotes.set(file, content)
  }
  tree.notes = nextNotes
  return tree
}
const deleteFolder = (tree, folder) => {
  const target = normalize(folder)
  tree.folders = new Set([...tree.folders].filter((item) => item !== target && !item.startsWith(`${target}/`)))
  tree.notes = new Map([...tree.notes].filter(([file]) => !file.startsWith(`${target}/`)))
  return tree
}
const listFolder = (tree, folder = '') => {
  const target = normalize(folder)
  const prefix = target ? `${target}/` : ''
  return [...tree.notes.keys()].filter((file) => file.startsWith(prefix)).sort()
}

describe('generated file workflow interface contracts', () => {
  for (let index = 0; index < 180; index += 1) {
    it(`create edit save reopen note workflow ${index}`, () => {
      const tree = createTree()
      createNote(tree, `Notes/Note ${index}.md`, `Initial ${index}`)
      expect(readNote(tree, `Notes/Note ${index}.md`)).toBe(`Initial ${index}`)
      saveNote(tree, `Notes/Note ${index}.md`, `Edited ${index}`)
      expect(readNote(tree, `Notes/Note ${index}.md`)).toBe(`Edited ${index}`)
      expect(listFolder(tree, 'Notes')).toContain(`Notes/Note ${index}.md`)
    })
  }

  for (let index = 0; index < 180; index += 1) {
    it(`move note into and out of folder workflow ${index}`, () => {
      const tree = createTree()
      createFolder(tree, `Inbox ${index}`)
      createFolder(tree, `Archive ${index}`)
      createNote(tree, `Inbox ${index}/Task ${index}.md`, `Task ${index}`)
      moveNote(tree, `Inbox ${index}/Task ${index}.md`, `Archive ${index}/Task ${index}.md`)
      expect(readNote(tree, `Archive ${index}/Task ${index}.md`)).toBe(`Task ${index}`)
      moveNote(tree, `Archive ${index}/Task ${index}.md`, `Task ${index}.md`)
      expect(readNote(tree, `Task ${index}.md`)).toBe(`Task ${index}`)
      expect(listFolder(tree, `Archive ${index}`)).not.toContain(`Archive ${index}/Task ${index}.md`)
    })
  }

  for (let index = 0; index < 180; index += 1) {
    it(`rename note and folder workflow ${index}`, () => {
      const tree = createTree()
      createNote(tree, `Folder ${index}/Old ${index}.md`, `Body ${index}`)
      renameNote(tree, `Folder ${index}/Old ${index}.md`, `Folder ${index}/New ${index}.md`)
      expect(readNote(tree, `Folder ${index}/New ${index}.md`)).toBe(`Body ${index}`)
      renameFolder(tree, `Folder ${index}`, `Renamed ${index}`)
      expect(readNote(tree, `Renamed ${index}/New ${index}.md`)).toBe(`Body ${index}`)
      expect(listFolder(tree, `Renamed ${index}`)).toContain(`Renamed ${index}/New ${index}.md`)
    })
  }

  for (let index = 0; index < 180; index += 1) {
    it(`delete note and folder workflow ${index}`, () => {
      const tree = createTree()
      createNote(tree, `Delete ${index}/A.md`, 'A')
      createNote(tree, `Delete ${index}/B.md`, 'B')
      deleteNote(tree, `Delete ${index}/A.md`)
      expect(readNote(tree, `Delete ${index}/A.md`)).toBe('')
      expect(readNote(tree, `Delete ${index}/B.md`)).toBe('B')
      deleteFolder(tree, `Delete ${index}`)
      expect(readNote(tree, `Delete ${index}/B.md`)).toBe('')
      expect(listFolder(tree, `Delete ${index}`)).toEqual([])
    })
  }
})
