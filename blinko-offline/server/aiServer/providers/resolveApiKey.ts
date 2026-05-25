type ResolveApiKeyArgs = {
  provider: string;
  apiKey?: unknown;
  providerConfig?: any;
};

function defaultEnvVarForProvider(provider: string): string | null {
  switch ((provider || '').toLowerCase()) {
    case 'openai':
      return 'OPENAI_API_KEY';
    case 'anthropic':
      return 'ANTHROPIC_API_KEY';
    default:
      return null;
  }
}

function parseEnvInterpolation(apiKey: unknown): string | null {
  if (typeof apiKey !== 'string') return null;
  const m = apiKey.trim().match(/^\$\{env:([A-Za-z_][A-Za-z0-9_]*)\}$/);
  return m?.[1] ?? null;
}

export function resolveApiKey({ provider, apiKey, providerConfig }: ResolveApiKeyArgs): any {
  const authMode = providerConfig?.authMode;

  const explicitEnvVar =
    (typeof providerConfig?.apiKeyEnvVar === 'string' && providerConfig.apiKeyEnvVar.trim()) ||
    null;

  const defaultEnvVar = defaultEnvVarForProvider(provider);
  const interpolatedEnvVar = parseEnvInterpolation(apiKey);

  if (authMode === 'env' || interpolatedEnvVar) {
    const envVar = interpolatedEnvVar || explicitEnvVar || defaultEnvVar;
    if (!envVar) {
      throw new Error(`No environment variable configured for provider ${provider}. Set config.apiKeyEnvVar.`);
    }
    const value = process.env[envVar];
    if (!value) {
      throw new Error(`Missing ${envVar} in environment for provider ${provider}.`);
    }
    return value;
  }

  // Convenience fallback: if no API key is stored, allow env-based key without UI changes.
  if ((apiKey == null || apiKey === '') && defaultEnvVar) {
    const value = process.env[defaultEnvVar];
    if (value) return value;
  }

  return apiKey;
}

