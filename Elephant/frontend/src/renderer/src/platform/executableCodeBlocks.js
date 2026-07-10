import { installExecutableCodeBlocks as installRuntime } from './executableCodeBlocksV6'
import { installExecutableCodeBlocksV6Lifecycle } from './executableCodeBlocksV6Lifecycle'
import './executableCodeBlocksV6.runtime.css'

export const installExecutableCodeBlocks = (target = globalThis) =>
  installExecutableCodeBlocksV6Lifecycle(installRuntime(target))
