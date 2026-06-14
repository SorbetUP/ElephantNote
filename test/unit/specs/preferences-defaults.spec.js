import schema from '../../../src/main/preferences/schema.json'
import DEFAULT_PREFERENCES, { createDefaultPreferences } from '../../../src/main/preferences/defaults'

describe('main preference defaults', () => {
  it('provides bundled defaults without static/preference.json', () => {
    const defaults = createDefaultPreferences()

    expect(defaults).to.deep.equal(DEFAULT_PREFERENCES)
    expect(defaults).not.to.equal(DEFAULT_PREFERENCES)
    expect(Object.keys(defaults).sort()).to.deep.equal(Object.keys(schema).sort())
    expect(defaults.language).to.equal('en')
    expect(defaults.theme).to.equal('light')
  })
})
