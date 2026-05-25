import type {
  LanguageModelV1,
  LanguageModelV1CallOptions,
  LanguageModelV1FinishReason,
  LanguageModelV1StreamPart,
} from '@ai-sdk/provider';
import { spawn } from 'child_process';
import { promptToPlainText } from './promptToText';
import { expandHome, chunkText, forEachJsonLine } from './shared';

type CodexCliLanguageModelOptions = {
  modelId: string;
  cliPath?: string;
};

type CodexJsonEvent =
  | { type: 'thread.started'; thread_id: string }
  | { type: 'turn.started' }
  | { type: 'item.completed'; item: { id: string; type: string; text?: string } }
  | { type: 'turn.completed'; usage?: { input_tokens?: number; output_tokens?: number } }
  | { type: string; [key: string]: unknown };

export class CodexCliLanguageModel implements LanguageModelV1 {
  readonly specificationVersion = 'v1' as const;
  readonly provider = 'openai' as const;
  readonly modelId: string;
  readonly defaultObjectGenerationMode = undefined;
  readonly supportsStructuredOutputs = false;

  private readonly cliPath: string;

  constructor(opts: CodexCliLanguageModelOptions) {
    this.modelId = opts.modelId;
    this.cliPath = expandHome(opts.cliPath || 'codex');
  }

  async doGenerate(options: LanguageModelV1CallOptions) {
    const promptText = promptToPlainText(options.prompt);

    const { text, usage } = await new Promise<{
      text: string;
      usage: { promptTokens: number; completionTokens: number };
    }>((resolve, reject) => {
      // Intentionally do not pass `--model`.
      // Codex CLI may reject explicit model selection depending on account type.
      const args = ['exec', '--skip-git-repo-check', '--sandbox', 'read-only', '--json', '-'];

      const child = spawn(this.cliPath, args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: process.env,
      });

      let combinedText = '';
      let promptTokens = 0;
      let completionTokens = 0;
      let stderr = '';

      child.stdin.write(promptText);
      child.stdin.end();

      child.stdout.on(
        'data',
        forEachJsonLine((evt) => {
          if (evt.type === 'item.completed') {
            const item = (evt as any).item;
            if (item?.type === 'agent_message' && typeof item.text === 'string') {
              combinedText += (combinedText ? '\n' : '') + item.text;
            }
          }
          if (evt.type === 'turn.completed') {
            const u = (evt as any).usage;
            promptTokens = Number(u?.input_tokens || 0);
            completionTokens = Number(u?.output_tokens || 0);
          }
        }),
      );
      child.stderr.on('data', (d) => {
        stderr += Buffer.from(d).toString('utf8');
      });

      child.on('error', (err: any) => {
        if (err?.code === 'ENOENT') {
          reject(new Error('codex CLI not found. Install/login Codex CLI or set provider config cliPath.'));
          return;
        }
        reject(err);
      });

      child.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`codex exec failed (exit ${code}). ${stderr.trim()}`.trim()));
          return;
        }
        resolve({
          text: combinedText,
          usage: { promptTokens, completionTokens },
        });
      });
    });

    return {
      text,
      finishReason: 'stop' as LanguageModelV1FinishReason,
      usage,
      rawCall: {
        rawPrompt: options.prompt,
        rawSettings: { via: 'codex-cli' },
      },
      rawResponse: undefined,
      warnings: [],
    };
  }

  async doStream(options: LanguageModelV1CallOptions) {
    const promptText = promptToPlainText(options.prompt);

    const stream = new ReadableStream<LanguageModelV1StreamPart>({
      start: (controller) => {
        const args = ['exec', '--skip-git-repo-check', '--sandbox', 'read-only', '--json', '-'];

        const child = spawn(this.cliPath, args, {
          stdio: ['pipe', 'pipe', 'pipe'],
          env: process.env,
        });

        let emittedText = '';
        let promptTokens = 0;
        let completionTokens = 0;
        let stderr = '';
        let sawError = false;

        child.stdin.write(promptText);
        child.stdin.end();

        child.stdout.on(
          'data',
          forEachJsonLine((evt) => {
            if (evt.type === 'item.completed') {
              const item = (evt as any).item;
              if (item?.type === 'agent_message' && typeof item.text === 'string') {
                const fullText = (emittedText ? emittedText + '\n' : '') + item.text;
                const delta = fullText.startsWith(emittedText) ? fullText.slice(emittedText.length) : fullText;
                emittedText = fullText;
                for (const chunk of chunkText(delta)) {
                  controller.enqueue({ type: 'text-delta', textDelta: chunk });
                }
              }
            }
            if (evt.type === 'turn.completed') {
              const u = (evt as any).usage;
              promptTokens = Number(u?.input_tokens || 0);
              completionTokens = Number(u?.output_tokens || 0);
            }
          }),
        );

        child.stderr.on('data', (d) => {
          stderr += Buffer.from(d).toString('utf8');
        });

        child.on('error', (err: any) => {
          sawError = true;
          const wrapped =
            err?.code === 'ENOENT'
              ? new Error('codex CLI not found. Install/login Codex CLI or set provider config cliPath.')
              : err;
          controller.enqueue({ type: 'error', error: wrapped });
          controller.close();
        });

        child.on('close', (code) => {
          if (sawError) return;
          if (code !== 0) {
            controller.enqueue({ type: 'error', error: new Error(`codex exec failed (exit ${code}). ${stderr.trim()}`.trim()) });
            controller.enqueue({ type: 'finish', finishReason: 'error', usage: { promptTokens, completionTokens } });
            controller.close();
            return;
          }
          controller.enqueue({ type: 'finish', finishReason: 'stop', usage: { promptTokens, completionTokens } });
          controller.close();
        });
      },
    });

    return {
      stream,
      rawCall: {
        rawPrompt: options.prompt,
        rawSettings: { via: 'codex-cli' },
      },
      warnings: [],
    };
  }
}

