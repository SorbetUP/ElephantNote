import {
  clampSearchLimit,
  normalizeSearchMode,
  normalizeSearchQuery
} from 'main_renderer/elephantnote/search/searchIpc'

describe('searchIpc validation helpers', () => {
  it('clamps huge limits', () => {
    expect(clampSearchLimit(1000)).to.equal(50)
    expect(clampSearchLimit(0)).to.equal(1)
  })

  it('accepts valid modes and rejects invalid ones', () => {
    expect(normalizeSearchMode('smart')).to.equal('smart')
    expect(normalizeSearchMode('exact')).to.equal('exact')
    expect(normalizeSearchMode('semantic')).to.equal('semantic')
    expect(() => normalizeSearchMode('invalid')).to.throw('Invalid search mode.')
  })

  it('validates query payloads', () => {
    expect(normalizeSearchQuery({ query: 'hello', mode: 'smart', limit: 100 })).to.deep.equal({
      query: 'hello',
      mode: 'smart',
      limit: 50
    })
    expect(() => normalizeSearchQuery({ query: 12 })).to.throw('Query must be a string.')
  })
})
