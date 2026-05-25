import { BufferLoader } from 'langchain/document_loaders/fs/buffer';
import { BaseProvider } from './BaseProvider';
import { OpenAIVoice } from '@mastra/voice-openai';
import { MastraVoice } from '@mastra/core/voice';
import OpenAI from 'openai';
import { resolveApiKey } from './resolveApiKey';

interface AudioConfig {
  provider: string;
  apiKey?: any;
  baseURL?: any;
  modelKey: string;
  apiVersion?: string;
  speaker?: string;
  speed?: number;
  providerConfig?: any;
}

export class AudioProvider extends BaseProvider {
  async getAudioModel(config: AudioConfig): Promise<MastraVoice | null> {
    await this.initializeFetch();

    switch (config.provider.toLowerCase()) {
      case 'openai':
        const apiKey = resolveApiKey({ provider: config.provider, apiKey: config.apiKey, providerConfig: config.providerConfig });
        if (apiKey) {
          const openAIVoice = new OpenAIVoice({
            speechModel: {
              apiKey: apiKey,
            },
            listeningModel: {
              name: config.modelKey as any || "whisper-1",
              apiKey: apiKey,
            },
          });
          return openAIVoice as unknown as MastraVoice
        }
        return null
      case 'azureopenai':
        return null;
      case 'azure':
        // TODO: Implement Azure OpenAI audio support
        return null;
      case 'custom':
      default:
        const apiKey2 = resolveApiKey({ provider: config.provider, apiKey: config.apiKey, providerConfig: config.providerConfig });
        if (apiKey2) {
          const openAIVoice = new OpenAIVoice({
            speechModel: {
              apiKey: apiKey2,
            },
            listeningModel: {
              name: config.modelKey as any || "whisper-1",
              apiKey: apiKey2,
            },
          });
          openAIVoice.listeningClient = new OpenAI({
            apiKey: apiKey2,
            baseURL: config.baseURL,
            fetch: this.proxiedFetch,
          });
          return openAIVoice as unknown as MastraVoice
        }
        return null
    }
  }
}
