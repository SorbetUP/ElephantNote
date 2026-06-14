import { GitSyncEngine } from '../sync/GitSyncEngine'
import { ModelRuntime } from '../modelRuntime'
import { ProgramRuntime } from '../programRuntime'

export const syncEngine = new GitSyncEngine()
export const modelRuntime = new ModelRuntime()
export const programRuntime = new ProgramRuntime()
