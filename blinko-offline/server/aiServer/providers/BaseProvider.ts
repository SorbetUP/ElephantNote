import { fetchWithProxy } from '@server/lib/proxy';

/**
 * Base class for all AI providers with common functionality
 */
export abstract class BaseProvider {
  protected proxiedFetch:  typeof fetch | undefined = undefined;
  protected initialized = false;

  constructor() {
    this.initializeFetch();
  }

  protected async initializeFetch() {
    if (this.initialized) return;

    try {
      this.proxiedFetch = await fetchWithProxy();
    } catch (error) {
      console.error('Failed to initialize proxy fetch:', error);
      this.proxiedFetch = fetch;
    }

    this.initialized = true;
  }

  protected async ensureInitialized() {
    if (!this.initialized) {
      await this.initializeFetch();
    }
  }
}