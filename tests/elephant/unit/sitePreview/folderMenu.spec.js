/* @vitest-environment node */

import fs from 'fs-extra'
import path from 'path'

describe('ElephantNote folder website menu entries', () => {
  it('shows one website action on folder cards only', async() => {
    const folderCard = await fs.readFile(path.resolve('Elephant/frontend/app/components/library/FolderCard.vue'), 'utf8')
    const noteCard = await fs.readFile(path.resolve('Elephant/frontend/app/components/library/NoteCard.vue'), 'utf8')

    expect(folderCard).to.contain('View as website')
    expect(folderCard).not.to.contain('Build static website')
    expect(noteCard).not.to.contain('View as website')
    expect(noteCard).not.to.contain('Build static website')
  })
})
