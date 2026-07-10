import { installExecutableCodeNativeRuntime } from './executableCodeNativeRuntime'
import { installExecutableCodeNativeLifecycle } from './executableCodeNativeLifecycle'
import { installExecutableCodeSettings } from './executableCodeSettings'

export const installExecutableCodeBlocks = (target = globalThis) => {
  const legacy = target.__ELEPHANT_CODE_RUNTIME__
  if (legacy?.version?.startsWith?.('v')) {
    legacy.dispose?.()
    delete target.__ELEPHANT_CODE_RUNTIME__
  }

  const runtime = installExecutableCodeNativeLifecycle(installExecutableCodeNativeRuntime(target))
  const settings = installExecutableCodeSettings(target)
  if (!runtime.__settingsDisposeWrapped) {
    runtime.__settingsDisposeWrapped = true
    const originalDispose = runtime.dispose.bind(runtime)
    runtime.dispose = () => {
      settings.dispose()
      originalDispose()
    }
  }
  return runtime
}
