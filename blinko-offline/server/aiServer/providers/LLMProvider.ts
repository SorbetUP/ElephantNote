import { LanguageModelV1, ProviderV1 } from '@ai-sdk/provider';
import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOllama } from 'ollama-ai-provider';
import { createDeepSeek } from '@ai-sdk/deepseek';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { createXai } from '@ai-sdk/xai';
import { createAzure } from '@ai-sdk/azure';
import { BaseProvider } from './BaseProvider';
import { resolveApiKey } from './resolveApiKey';
import { CodexCliLanguageModel } from './cli/CodexCliLanguageModel';
import { ClaudeCodeCliLanguageModel } from './cli/ClaudeCodeCliLanguageModel';

interface LLMConfig {
  provider: string;
  apiKey?: any;
  baseURL?: any;
  modelKey: string;
  apiVersion?: any;
  providerConfig?: any;
}

export class LLMProvider extends BaseProvider {
  async getLanguageModel(config: LLMConfig): Promise<LanguageModelV1> {
    await this.ensureInitialized();
    switch (config.provider.toLowerCase()) {
      case 'openai': {
        if (config.providerConfig?.authMode === 'codex-cli') {
          return new CodexCliLanguageModel({
            modelId: config.modelKey,
            cliPath: config.providerConfig?.cliPath,
          });
        }
        const apiKey = resolveApiKey({ provider: config.provider, apiKey: config.apiKey, providerConfig: config.providerConfig });
        return createOpenAI({
          apiKey: apiKey,
          baseURL: config.baseURL || undefined,
          fetch: this.proxiedFetch
        }).languageModel(config.modelKey);
      }

      case 'anthropic': {
        if (config.providerConfig?.authMode === 'claude-code-cli') {
          return new ClaudeCodeCliLanguageModel({
            modelId: config.modelKey,
            cliPath: config.providerConfig?.cliPath,
          });
        }
        const apiKey = resolveApiKey({ provider: config.provider, apiKey: config.apiKey, providerConfig: config.providerConfig });
        return createAnthropic({
          apiKey: apiKey,
          baseURL: config.baseURL || undefined,
          fetch: this.proxiedFetch
        }).languageModel(config.modelKey);
      }

      case 'gemini':
      case 'google':
        return createGoogleGenerativeAI({
          apiKey: config.apiKey,
          fetch: this.proxiedFetch
        }).languageModel(config.modelKey);

      case 'ollama':
        // Be defensive: users sometimes paste `http:// localhost:11434` or include invisible chars.
        // Also avoid producing `undefined/api` when baseURL is missing.
        const rawBase =
          typeof config.baseURL === 'string'
            ? config.baseURL
            : config.baseURL == null
              ? ''
              : String(config.baseURL);
        const cleanedBase = rawBase.trim().replace(/[\s\u200B\uFEFF\u200E\u200F]+/g, '');
        const normalizedBase = cleanedBase
          ? cleanedBase.replace(/\/+$/, '').replace(/\/api$/, '') + '/api'
          : undefined;

        return createOllama({
          baseURL: normalizedBase,
          fetch: this.proxiedFetch
        }).languageModel(config.modelKey);

      case 'deepseek':
        return createDeepSeek({
          apiKey: config.apiKey,
          fetch: this.proxiedFetch
        }).languageModel(config.modelKey);

      case 'openrouter':
        return createOpenRouter({
          apiKey: config.apiKey,
          fetch: this.proxiedFetch
        }).languageModel(config.modelKey);

      case 'grok':
      case 'xai':
        return createXai({
          apiKey: config.apiKey,
          fetch: this.proxiedFetch
        }).languageModel(config.modelKey);

      case 'azureopenai':
      case 'azure':
        return createAzure({
          apiKey: config.apiKey,
          baseURL: config.baseURL || undefined,
          apiVersion: config.apiVersion || undefined,
          fetch: this.proxiedFetch
        }).languageModel(config.modelKey);

      case 'custom':
      default:
        // Allow OpenAI-compatible providers to use `${env:VAR}` interpolation.
        // Note: this only supports OpenAI/Anthropic defaults; custom providers should store keys explicitly.
        const apiKey = resolveApiKey({ provider: config.provider, apiKey: config.apiKey, providerConfig: config.providerConfig });
        return createOpenAI({
          apiKey: apiKey,
          baseURL: config.baseURL || undefined,
          fetch: this.proxiedFetch
        }).languageModel(config.modelKey);
    }
  }
}
