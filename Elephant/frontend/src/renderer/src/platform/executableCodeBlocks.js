import { installExecutableCodeBlockChrome } from './executableCodeBlockChrome'
import { installExecutableCodeBlocks as installRuntime } from './executableCodeBlocksV3'

export const installExecutableCodeBlocks = (target = globalThis) => {
  const runtime = installRuntime(target)
  return installExecutableCodeBlockChrome(target, runtime)
}
