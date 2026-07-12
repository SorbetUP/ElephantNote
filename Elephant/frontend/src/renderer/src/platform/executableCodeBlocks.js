import { installExecutableCodeNativeRuntime } from './executableCodeNativeRuntime'
import { installExecutableCodeNativeLifecycle } from './executableCodeNativeLifecycle'

export const installExecutableCodeBlocks = (target = globalThis) => {
  const legacy = target.__ELEPHANT_CODE_RUNTIME__
  if (legacy?.version?.startsWith?.('v')) {
    legacy.dispose?.()
    delete target.__ELEPHANT_CODE_RUNTIME__
  }

  return installExecutableCodeNativeLifecycle(installExecutableCodeNativeRuntime(target))
}
