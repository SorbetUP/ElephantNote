/* @vitest-environment node */

import { describe, expect, it, vi } from 'vitest'
import {
  installLlamaWarningFilter,
  shouldSuppressLlamaWarningText
} from '../../../src/main/llamaWarningFilter.js'

describe('llama warning filter', () => {
  it('suppresses the known benign llama.cpp startup warnings', () => {
    expect(shouldSuppressLlamaWarningText(
      'llama_context: n_ctx_seq (512) < n_ctx_train (8192) -- the full capacity of the model will not be utilized'
    )).toBe(true)
    expect(shouldSuppressLlamaWarningText(
      'init: embeddings required but some input tokens were not marked as outputs -> overriding'
    )).toBe(true)
    expect(shouldSuppressLlamaWarningText('llama_context: something else entirely')).toBe(false)
  })

  it('filters benign warnings from console methods and stdio writes', () => {
    const originalWarn = vi.fn()
    const originalError = vi.fn()
    const originalLog = vi.fn()
    const originalInfo = vi.fn()
    const originalEmitWarning = vi.fn()
    const stdoutWrite = vi.fn(() => true)
    const stderrWrite = vi.fn(() => true)
    const fakeConsole = {
      log: originalLog,
      info: originalInfo,
      warn: originalWarn,
      error: originalError
    }
    const fakeProcess = {
      emitWarning: originalEmitWarning,
      stdout: { write: stdoutWrite },
      stderr: { write: stderrWrite }
    }

    installLlamaWarningFilter({
      process: fakeProcess,
      console: fakeConsole
    })

    fakeConsole.warn('llama_context: n_ctx_seq (512) < n_ctx_train (8192) -- the full capacity of the model will not be utilized')
    fakeConsole.error('init: embeddings required but some input tokens were not marked as outputs -> overriding')
    fakeConsole.info('node-llama-cpp ready')
    fakeProcess.emitWarning('llama_context: n_ctx_seq (512) < n_ctx_train (8192) -- the full capacity of the model will not be utilized')
    fakeProcess.stdout.write('llama_context: n_ctx_seq (512) < n_ctx_train (8192) -- the full capacity of the model will not be utilized\n')
    fakeProcess.stderr.write('hello from stderr\n')

    expect(originalWarn).not.toHaveBeenCalled()
    expect(originalError).not.toHaveBeenCalled()
    expect(originalInfo).toHaveBeenCalledWith('node-llama-cpp ready')
    expect(originalEmitWarning).not.toHaveBeenCalled()
    expect(stdoutWrite).not.toHaveBeenCalled()
    expect(stderrWrite).toHaveBeenCalledWith('hello from stderr\n', undefined, undefined)
  })
})
