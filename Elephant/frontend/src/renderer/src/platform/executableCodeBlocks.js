import { installWithCodeMutationGuard } from './executableCodeMutationGuard'
import { installExecutableCodeBlocks as installRuntime } from './executableCodeBlocksV4'

export const installExecutableCodeBlocks = (target = globalThis) =>
  installWithCodeMutationGuard(target, installRuntime)
