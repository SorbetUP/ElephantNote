import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8')

const ciSkillPaths = [
  'agent/skill/ci-architect/SKILL.md',
  'agent/skill/github-actions-linter/SKILL.md',
  'agent/skill/github-actions-security/SKILL.md',
  'agent/skill/runtime-ci-hardening/SKILL.md',
  'agent/skill/anti-fake-tests/SKILL.md',
  'agent/skill/tauri-ci-verifier/SKILL.md',
  'agent/skill/cross-platform-paths/SKILL.md',
  'agent/skill/ci-stability/SKILL.md',
  'agent/skill/supply-chain-verifier/SKILL.md',
  'agent/skill/artifact-release-gate/SKILL.md'
]

describe('agent CI verification skills', () => {
  it('keeps every CI verification skill present and declared with skill metadata', () => {
    for (const skillPath of ciSkillPaths) {
      const content = read(skillPath)

      expect(content).toContain('---\nname: ')
      expect(content).toContain('description: >')
      expect(content).toContain('# ')
      expect(content).toContain('APEX integration')
    }
  })

  it('routes CI work from APEX and ElephantNote CI into narrow verification skills', () => {
    const apex = read('agent/skill/apex/SKILL.md')
    const elephantnoteCi = read('agent/skill/elephantnote-ci/SKILL.md')

    for (const skillPath of ciSkillPaths) {
      const route = skillPath.replace('agent/skill/', '../')
      expect(`${apex}\n${elephantnoteCi}`).toContain(route)
    }

    expect(apex).toContain('the selected gate must prove the user-visible or runtime contract touched by the change')
    expect(elephantnoteCi).toContain('CI passing must mean the relevant behavior is actually checked')
  })

  it('keeps anti-fake, Tauri, path, and artifact proof rules explicit', () => {
    expect(read('agent/skill/anti-fake-tests/SKILL.md')).toContain('observable contract')
    expect(read('agent/skill/tauri-ci-verifier/SKILL.md')).toContain('A successful web build alone is not proof that the packaged app opens')
    expect(read('agent/skill/cross-platform-paths/SKILL.md')).toContain('Hidden app folders must not show as normal notes in the main tree')
    expect(read('agent/skill/artifact-release-gate/SKILL.md')).toContain('The expected artifact exists at the expected path')
  })
})
