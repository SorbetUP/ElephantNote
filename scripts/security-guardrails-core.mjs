import fs from 'node:fs'
import path from 'node:path'

export const DEFAULT_BASELINE_PATH = 'security/guardrails-baseline.json'

const BLOCKER = 'blocker'
const WARNING = 'warning'

const readText = (filePath) => fs.readFileSync(filePath, 'utf8')

const toRepoPath = (root, absolutePath) => path.relative(root, absolutePath).split(path.sep).join('/')

const readJson = (filePath) => JSON.parse(readText(filePath))

const exists = (filePath) => fs.existsSync(filePath)

const listFiles = (directory, predicate = () => true) => {
  if (!exists(directory)) return []
  const pending = [directory]
  const files = []

  while (pending.length) {
    const current = pending.pop()
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const absolutePath = path.join(current, entry.name)
      if (entry.isDirectory()) {
        pending.push(absolutePath)
      } else if (entry.isFile() && predicate(absolutePath)) {
        files.push(absolutePath)
      }
    }
  }

  return files.sort()
}

const normalizePermissionValue = (value) => String(value ?? '').trim().replaceAll('\\', '/')

const makeFinding = ({ severity = BLOCKER, id, file, value, message }) => ({
  severity,
  id,
  file,
  value: String(value ?? ''),
  message
})

export const makeFindingKey = (finding) => [finding.id, finding.file, String(finding.value ?? '')].join('\u0000')

export const loadSecurityBaseline = (root = process.cwd(), baselinePath = DEFAULT_BASELINE_PATH) => {
  const absolutePath = path.join(root, baselinePath)
  if (!exists(absolutePath)) return { acceptedFindings: [] }

  const baseline = readJson(absolutePath)
  return {
    ...baseline,
    acceptedFindings: Array.isArray(baseline.acceptedFindings) ? baseline.acceptedFindings : []
  }
}

export const splitFindingsByBaseline = (findings, baseline = { acceptedFindings: [] }) => {
  const acceptedKeys = new Set((baseline.acceptedFindings || []).map(makeFindingKey))
  const acceptedFindings = []
  const newFindings = []

  for (const finding of findings) {
    if (acceptedKeys.has(makeFindingKey(finding))) acceptedFindings.push(finding)
    else newFindings.push(finding)
  }

  return { acceptedFindings, newFindings }
}

const getScopePath = (entry) => {
  if (typeof entry === 'string') return entry
  if (entry && typeof entry === 'object' && typeof entry.path === 'string') return entry.path
  return null
}

const isBroadFsScope = (scopePath) => {
  const value = normalizePermissionValue(scopePath)
  if (!value) return false

  if (['/', '/**', '/**/*', '*', '**', '**/*'].includes(value)) return true

  const broadVariables = [
    '$HOME',
    '$DOCUMENT',
    '$DOWNLOAD',
    '$DESKTOP',
    '$APPDATA',
    '$LOCALDATA',
    '$CONFIG',
    '$CACHE'
  ]

  return broadVariables.some((variableName) => (
    value === variableName ||
    value === `${variableName}/**` ||
    value === `${variableName}/**/*`
  ))
}

const scanTauriCapabilities = (root, findings) => {
  const capabilityDirectory = path.join(root, 'src-tauri', 'capabilities')
  const capabilityFiles = listFiles(capabilityDirectory, (filePath) => filePath.endsWith('.json'))

  for (const capabilityFile of capabilityFiles) {
    const file = toRepoPath(root, capabilityFile)
    let capability
    try {
      capability = readJson(capabilityFile)
    } catch (error) {
      findings.push(makeFinding({
        id: 'TAURI_CAPABILITY_INVALID_JSON',
        file,
        value: error.message,
        message: 'Tauri capability JSON must be parseable so permissions can be audited.'
      }))
      continue
    }

    const permissions = Array.isArray(capability.permissions) ? capability.permissions : []
    let hasFsScope = false
    let hasWriteLikeFsPermission = false

    for (const permission of permissions) {
      if (typeof permission === 'string') {
        if (permission === 'fs:default') {
          findings.push(makeFinding({
            id: 'TAURI_FS_DEFAULT_PERMISSION',
            file,
            value: permission,
            message: 'Avoid fs:default; list only the exact filesystem operations the app needs.'
          }))
        }

        if (/^shell:/.test(permission)) {
          findings.push(makeFinding({
            id: 'TAURI_SHELL_PERMISSION',
            file,
            value: permission,
            message: 'Shell permissions are high risk and must not be added without a dedicated threat model.'
          }))
        }

        if (/^process:/.test(permission)) {
          findings.push(makeFinding({
            id: 'TAURI_PROCESS_PERMISSION',
            file,
            value: permission,
            message: 'Process permissions can affect app lifecycle or command execution and must be reviewed explicitly.'
          }))
        }

        if (/^fs:allow-(write-file|mkdir|remove|rename|copy-file)$/.test(permission)) {
          hasWriteLikeFsPermission = true
        }
      } else if (permission && typeof permission === 'object') {
        if (permission.identifier === 'fs:scope') {
          hasFsScope = true
          const allowEntries = Array.isArray(permission.allow) ? permission.allow : []
          for (const entry of allowEntries) {
            const scopePath = getScopePath(entry)
            if (isBroadFsScope(scopePath)) {
              findings.push(makeFinding({
                id: 'TAURI_FS_SCOPE_BROAD',
                file,
                value: normalizePermissionValue(scopePath),
                message: 'Filesystem scopes should be vault-specific or app-data-specific, not broad user directories.'
              }))
            }
          }
        }
      }
    }

    if (hasWriteLikeFsPermission && !hasFsScope) {
      findings.push(makeFinding({
        id: 'TAURI_FS_WRITE_WITHOUT_SCOPE',
        file,
        value: 'write-like fs permission without fs:scope',
        message: 'Write-like filesystem permissions must be constrained by an fs:scope block.'
      }))
    }
  }
}

const scanGitHubWorkflows = (root, findings) => {
  const workflowDirectory = path.join(root, '.github', 'workflows')
  const workflowFiles = listFiles(workflowDirectory, (filePath) => /\.ya?ml$/.test(filePath))

  for (const workflowFile of workflowFiles) {
    const file = toRepoPath(root, workflowFile)
    const content = readText(workflowFile)

    if (/^\s*pull_request_target\s*:/m.test(content)) {
      findings.push(makeFinding({
        id: 'GITHUB_ACTIONS_PULL_REQUEST_TARGET',
        file,
        value: 'pull_request_target',
        message: 'pull_request_target can expose secrets to untrusted PR code and must not be used here.'
      }))
    }

    if (/^\s*permissions\s*:\s*write-all\s*$/m.test(content)) {
      findings.push(makeFinding({
        id: 'GITHUB_ACTIONS_WRITE_ALL',
        file,
        value: 'permissions: write-all',
        message: 'Workflow permissions must be least-privilege, not write-all.'
      }))
    }

    const broadWritePermission = content.match(/^\s*(contents|actions|checks|deployments|id-token|issues|packages|pages|pull-requests|repository-projects|statuses)\s*:\s*write\s*$/m)
    if (broadWritePermission) {
      findings.push(makeFinding({
        id: 'GITHUB_ACTIONS_WRITE_PERMISSION',
        file,
        value: broadWritePermission[0].trim(),
        message: 'Write permissions in CI must be justified by a dedicated release or reporting workflow.'
      }))
    }
  }
}

const scanPackageScripts = (root, findings) => {
  const packageFile = path.join(root, 'package.json')
  if (!exists(packageFile)) return

  const packageJson = readJson(packageFile)
  const scripts = packageJson.scripts || {}
  const dangerousPipePattern = /(curl|wget)\b[^|\n]*\|\s*(sh|bash|zsh|pwsh|powershell)\b/
  const processEnvPattern = /NODE_TLS_REJECT_UNAUTHORIZED\s*=\s*0/

  for (const [scriptName, command] of Object.entries(scripts)) {
    if (dangerousPipePattern.test(command)) {
      findings.push(makeFinding({
        id: 'PACKAGE_SCRIPT_REMOTE_PIPE_TO_SHELL',
        file: 'package.json',
        value: `${scriptName}: ${command}`,
        message: 'Package scripts must not pipe remote content directly into a shell.'
      }))
    }

    if (processEnvPattern.test(command)) {
      findings.push(makeFinding({
        id: 'PACKAGE_SCRIPT_DISABLE_TLS_VALIDATION',
        file: 'package.json',
        value: `${scriptName}: ${command}`,
        message: 'Package scripts must not disable TLS certificate validation.'
      }))
    }
  }
}

export const collectSecurityFindings = (root = process.cwd()) => {
  const findings = []
  scanTauriCapabilities(root, findings)
  scanGitHubWorkflows(root, findings)
  scanPackageScripts(root, findings)
  return findings.sort((left, right) => makeFindingKey(left).localeCompare(makeFindingKey(right)))
}

export const summarizeFindings = ({ acceptedFindings, newFindings }) => {
  const blockerCount = newFindings.filter((finding) => finding.severity === BLOCKER).length
  const warningCount = newFindings.filter((finding) => finding.severity === WARNING).length

  return {
    blockerCount,
    warningCount,
    acceptedCount: acceptedFindings.length,
    hasBlockingFindings: blockerCount > 0
  }
}
