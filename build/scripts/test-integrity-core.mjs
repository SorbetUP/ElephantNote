const FORBIDDEN_ADDITIONS = [
  {
    name: 'focused test',
    pattern: /\b(?:describe|it|test)\.only\s*\(/
  },
  {
    name: 'disabled test',
    pattern: /\b(?:describe|it|test)\.skip\s*\(/
  },
  {
    name: 'todo test',
    pattern: /\b(?:describe|it|test)\.todo\s*\(/
  },
  {
    name: 'trivial true assertion',
    pattern: /\bexpect\s*\(\s*true\s*\)\.toBe\s*\(\s*true\s*\)/
  },
  {
    name: 'trivial false assertion',
    pattern: /\bexpect\s*\(\s*false\s*\)\.toBe\s*\(\s*false\s*\)/
  },
  {
    name: 'empty test body',
    pattern: /\b(?:it|test)\s*\([^\n]*,\s*\(\s*\)\s*=>\s*\{\s*\}\s*\)/
  }
]

export const addedSourceLines = (diff = '') =>
  String(diff || '')
    .split(/\r?\n/)
    .filter((line) => line.startsWith('+') && !line.startsWith('+++'))
    .map((line) => line.slice(1))

export const findForbiddenTestAdditions = (diff = '') => {
  const failures = []
  for (const [index, line] of addedSourceLines(diff).entries()) {
    for (const rule of FORBIDDEN_ADDITIONS) {
      if (rule.pattern.test(line)) failures.push({ line: index + 1, rule: rule.name, source: line.trim() })
    }
  }
  return failures
}

export const countTestContracts = (source = '') => {
  const value = String(source || '')
  const tests = [...value.matchAll(/\b(?:it|test)(?:\.each\s*\([^)]*\))?\s*\(/g)].length
  const assertions = [...value.matchAll(/\bexpect\s*\(/g)].length
  return { tests, assertions }
}

export const validateChangedTestSource = (filename, source = '') => {
  const failures = []
  if (!/\.(?:spec|test)\.[cm]?[jt]sx?$/.test(filename)) return failures
  const { tests, assertions } = countTestContracts(source)
  if (tests === 0) failures.push(`${filename}: no executable test contract found`)
  if (assertions === 0) failures.push(`${filename}: no assertion found`)
  return failures
}
