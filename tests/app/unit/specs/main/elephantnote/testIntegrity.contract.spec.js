import { describe, expect, it } from 'vitest'
import {
  addedSourceLines,
  countTestContracts,
  findForbiddenTestAdditions,
  validateChangedTestSource
} from '../../../../../../build/scripts/test-integrity-core.mjs'

describe('test integrity diff parsing', () => {
  it('keeps only added source lines', () => {
    const diff = ['--- a/test.js', '+++ b/test.js', '@@ -1 +1 @@', '-old', '+new', ' context'].join('\n')
    expect(addedSourceLines(diff)).toEqual(['new'])
  })

  it('supports CRLF diffs', () => {
    expect(addedSourceLines('+++ b/test.js\r\n+expect(value).toBe(1)\r\n')).toEqual([
      'expect(value).toBe(1)'
    ])
  })

  it.each([
    ['+it.only("x", () => {})', 'focused test'],
    ['+test.only("x", () => {})', 'focused test'],
    ['+describe.only("x", () => {})', 'focused test'],
    ['+it.skip("x", () => {})', 'disabled test'],
    ['+test.skip("x", () => {})', 'disabled test'],
    ['+describe.skip("x", () => {})', 'disabled test'],
    ['+it.todo("x")', 'todo test'],
    ['+test.todo("x")', 'todo test'],
    ['+expect(true).toBe(true)', 'trivial true assertion'],
    ['+expect(false).toBe(false)', 'trivial false assertion'],
    ['+it("x", () => {})', 'empty test body']
  ])('rejects %s as %s', (line, rule) => {
    expect(findForbiddenTestAdditions(line)).toEqual([
      expect.objectContaining({ rule })
    ])
  })

  it.each([
    '+it("works", () => expect(result).toBe(expected))',
    '+expect(value).toBe(true)',
    '+const skipped = false',
    '+// test.skip is documentation, not an invocation'
  ])('accepts a legitimate added line: %s', (line) => {
    expect(findForbiddenTestAdditions(line)).toEqual([])
  })
})

describe('test integrity contract counting', () => {
  it('counts regular test and assertion calls', () => {
    expect(countTestContracts('it("x", () => { expect(1).toBe(1) })')).toEqual({
      tests: 1,
      assertions: 1
    })
  })

  it('counts test.each contracts', () => {
    expect(countTestContracts('test.each([1, 2])("x", value => expect(value).toBeTruthy())')).toEqual({
      tests: 1,
      assertions: 1
    })
  })

  it('counts multiple contracts independently', () => {
    const source = [
      'it("a", () => expect(a).toBe(1))',
      'test("b", () => { expect(b).toBe(2); expect(c).toBe(3) })'
    ].join('\n')
    expect(countTestContracts(source)).toEqual({ tests: 2, assertions: 3 })
  })

  it('reports an assertion-free changed spec', () => {
    expect(validateChangedTestSource('sample.spec.js', 'it("x", () => run())')).toEqual([
      'sample.spec.js: no assertion found'
    ])
  })

  it('reports a contract-free changed spec', () => {
    expect(validateChangedTestSource('sample.spec.js', 'expect(value).toBe(1)')).toEqual([
      'sample.spec.js: no executable test contract found'
    ])
  })

  it('reports both failures for an empty spec', () => {
    expect(validateChangedTestSource('sample.test.ts', '')).toEqual([
      'sample.test.ts: no executable test contract found',
      'sample.test.ts: no assertion found'
    ])
  })

  it('ignores helper files that are not test files', () => {
    expect(validateChangedTestSource('tests/helpers/runtime.js', '')).toEqual([])
  })

  it.each([
    'sample.spec.js',
    'sample.test.js',
    'sample.spec.ts',
    'sample.test.tsx',
    'sample.spec.mjs',
    'sample.test.cjs'
  ])('accepts a valid changed test file extension: %s', (filename) => {
    expect(
      validateChangedTestSource(filename, 'it("works", () => expect(value).toBe(expected))')
    ).toEqual([])
  })
})
