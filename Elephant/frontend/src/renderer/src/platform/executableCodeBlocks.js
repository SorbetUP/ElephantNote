import { installExecutableCodeBlocks as installRuntime } from './executableCodeBlocksV6'
import { installExecutableCodeBlocksV6Lifecycle } from './executableCodeBlocksV6Lifecycle'
import { installExecutableCodeLanguageBridge } from './executableCodeLanguageBridge'
import './executableCodeBlocksV6.runtime.css'

export const installExecutableCodeBlocks = (target = globalThis) => {
  const bridge = installExecutableCodeLanguageBridge(target)
  const runtime = installExecutableCodeBlocksV6Lifecycle(installRuntime(target))
  bridge.bind(runtime)

  if (!runtime.__codeLanguageBridgeDisposeWrapped) {
    runtime.__codeLanguageBridgeDisposeWrapped = true
    const originalDispose = runtime.dispose.bind(runtime)
    runtime.dispose = () => {
      bridge.dispose()
      originalDispose()
    }
  }

  return runtime
}
