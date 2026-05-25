import { observer } from 'mobx-react-lite';
import { Button, Input, Card, CardBody, Chip, Divider } from '@heroui/react';
import { Icon } from '@/components/Common/Iconify/icons';
import { useTranslation } from 'react-i18next';
import { useState, useEffect } from 'react';
import { RootStore } from '@/store';
import { DialogStore } from '@/store/module/Dialog';
import { ProviderIcon } from '@/components/BlinkoSettings/AiSetting/AIIcon';
import { AiProvider, AiSettingStore } from '@/store/aiSettingStore';
import { PROVIDER_TEMPLATES } from './constants';
import { Copy } from '@/components/Common/Copy';
import { ToastPlugin } from '@/store/module/Toast/Toast';
import { isInTauri } from '@/lib/tauriHelper';
import { detectAiCliBinaries, type AiCliDetectResult } from '@/lib/aiCliDetect';

interface ProviderDialogContentProps {
  provider?: AiProvider;
}

// Steps indicator component
const StepsIndicator = ({ currentStep, totalSteps }: { currentStep: number; totalSteps: number }) => {
  return (
    <div className="flex items-center justify-center mb-8">
      {Array.from({ length: totalSteps }, (_, index) => (
        <div key={index} className="flex items-center">
          <div
            className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-all ${index + 1 <= currentStep
              ? 'bg-primary text-primary-foreground'
              : 'bg-default-100 text-default-500'
              }`}
          >
            {index + 1}
          </div>
          {index < totalSteps - 1 && (
            <div
              className={`w-12 h-0.5 mx-2 transition-all ${index + 1 < currentStep ? 'bg-primary' : 'bg-default-200'
                }`}
            />
          )}
        </div>
      ))}
    </div>
  );
};

export default observer(function ProviderDialogContent({ provider }: ProviderDialogContentProps) {
  const { t } = useTranslation();
  const aiSettingStore = RootStore.Get(AiSettingStore);
  const toast = RootStore.Get(ToastPlugin);
  const [currentStep, setCurrentStep] = useState(provider ? 2 : 1);
  const [selectedTemplate, setSelectedTemplate] = useState<string>(provider?.provider || '');

  const [editingProvider, setEditingProvider] = useState<Partial<AiProvider>>(() => {
    if (provider) {
      return { ...provider };
    }
    return {
      id: 0,
      title: '',
      provider: '',
      baseURL: '',
      apiKey: '',
      sortOrder: 0,
      models: []
    };
  });

  const providerType = (editingProvider.provider || selectedTemplate || '').toLowerCase();
  const isOllama = providerType === 'ollama';
  const isOpenAI = providerType === 'openai';
  const isAnthropic = providerType === 'anthropic';
  const inTauri = isInTauri();
  const [cliDetect, setCliDetect] = useState<AiCliDetectResult | null>(null);
  const [cliDetectBusy, setCliDetectBusy] = useState(false);

  // Initialize editing mode if provider exists
  useEffect(() => {
    if (provider) {
      setCurrentStep(2);
      setSelectedTemplate(provider.provider);
    }
  }, [provider]);

  const runCliDetect = async () => {
    if (!inTauri) return;
    setCliDetectBusy(true);
    try {
      const result = await detectAiCliBinaries();
      setCliDetect(result);
      return result;
    } catch (e: any) {
      toast.error(e?.message || String(e));
      return null;
    } finally {
      setCliDetectBusy(false);
    }
  };

  const authMode = (editingProvider.config as any)?.authMode || 'api-key';
  const usesEnvApiKey = (isOpenAI || isAnthropic) && authMode === 'env';
  const usesCodexCli = isOpenAI && authMode === 'codex-cli';
  const usesClaudeCodeCli = isAnthropic && authMode === 'claude-code-cli';
  const usesCliAuth = usesCodexCli || usesClaudeCodeCli;

  const apiKeyEnvVar =
    ((editingProvider.config as any)?.apiKeyEnvVar as string | undefined) ||
    (isOpenAI ? 'OPENAI_API_KEY' : isAnthropic ? 'ANTHROPIC_API_KEY' : '');
  const cliPath = ((editingProvider.config as any)?.cliPath as string | undefined) || '';

  useEffect(() => {
    if (!usesCliAuth) return;
    if (!inTauri) return;

    let cancelled = false;
    (async () => {
      const current = cliPath.trim();
      if (current) return;

      const result = cliDetect || (await runCliDetect());
      if (cancelled || !result) return;

      const info = usesCodexCli ? result.codex : usesClaudeCodeCli ? result.claude : null;
      const detectedPath = info?.found ? (info.path || '') : '';
      if (!detectedPath) return;

      setEditingProvider((prev) => ({
        ...prev,
        config: {
          ...(prev.config as any || {}),
          cliPath: detectedPath,
        },
      }));
    })();

    return () => {
      cancelled = true;
    };
    // Intentionally omit cliDetect/runCliDetect from deps to avoid loops while typing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usesCliAuth, usesCodexCli, usesClaudeCodeCli, inTauri, authMode]);

  const handleTemplateSelect = (templateValue: string) => {
    if (templateValue === 'custom') {
      setSelectedTemplate('custom');
      setEditingProvider(prev => ({
        ...prev,
        provider: 'custom',
        title: 'Custom Provider',
        baseURL: 'https://api.example.com/v1'
      }));
    } else {
      const template = PROVIDER_TEMPLATES.find(t => t.value === templateValue);
      if (template) {
        setSelectedTemplate(templateValue);
        setEditingProvider(prev => ({
          ...prev,
          provider: template.value,
          title: template.defaultName,
          baseURL: template.defaultBaseURL
        }));
      }
    }
    setCurrentStep(2);
  };

  const handleSaveProvider = async () => {
    if (!editingProvider) return;

    if (editingProvider.id) {
      await aiSettingStore.updateProvider.call(editingProvider as any);
    } else {
      await aiSettingStore.createProvider.call(editingProvider as any);
    }
    RootStore.Get(DialogStore).close();
  };

  // Step 1: Provider Selection
  const renderProviderSelection = () => (
    <div className="space-y-6">
      {/* Custom Configuration Option */}
      <Card
        shadow='none'
        isPressable
        className="hover:bg-default-50 transition-colors cursor-pointer bg-secondbackground w-full"
        onPress={() => handleTemplateSelect('custom')}
      >
        <CardBody className="flex flex-row items-center gap-4 p-4">
          <div className="flex-shrink-0">
            <div className="w-12 h-12 rounded-lg flex items-center justify-center relative">
              <ProviderIcon provider="openai" className="w-6 h-6 text-primary" />
              <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-white rounded-full flex items-center justify-center">
                <Icon icon="hugeicons:settings-03" className="w-2.5 h-2.5 text-primary" />
              </div>
            </div>
          </div>
          <div className="flex-1">
            <h4 className="font-medium">{t('custom-configuration')}</h4>
            <p className="text-sm text-default-500">{t('configure-your-own-api-endpoint')}</p>
          </div>
          <Icon icon="hugeicons:arrow-right-02" className="w-5 h-5 text-default-400" />
        </CardBody>
      </Card>

      {/* Provider Templates */}
      <div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {PROVIDER_TEMPLATES.map((template) => {
            return (
              <Card
                shadow='none'
                key={template.value}
                isPressable
                className="hover:bg-default-50 transition-colors cursor-pointer bg-secondbackground"
                onPress={() => handleTemplateSelect(template.value)}
              >
                <CardBody className="flex flex-row items-center gap-3 p-4">
                  <div className="flex-shrink-0">
                    <ProviderIcon provider={template.value} className="w-8 h-8" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h5 className="font-medium truncate">{template.label}</h5>
                    <p className="text-xs text-default-500 line-clamp-2">{template.description}</p>
                  </div>
                  <Icon icon="hugeicons:arrow-right-02" className="w-4 h-4 text-default-400" />
                </CardBody>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );

  // Step 2: Configuration
  const renderConfiguration = () => {
    const template = PROVIDER_TEMPLATES.find((t) => t.value === selectedTemplate);

    const setAuthModeValue = (value: string) => {
      setEditingProvider((prev) => ({
        ...prev,
        apiKey: value === 'api-key' ? (prev.apiKey || '') : '',
        config: {
          ...(prev.config as any || {}),
          authMode: value,
          apiKeyEnvVar:
            value === 'env'
              ? ((prev.config as any)?.apiKeyEnvVar || (isOpenAI ? 'OPENAI_API_KEY' : 'ANTHROPIC_API_KEY'))
              : (prev.config as any)?.apiKeyEnvVar,
          cliPath:
            value.endsWith('-cli')
              ? ((prev.config as any)?.cliPath || '')
              : (prev.config as any)?.cliPath,
        },
      }));
    };

    const cliInfo = usesCodexCli ? cliDetect?.codex : usesClaudeCodeCli ? cliDetect?.claude : null;
    const detectedPath = (cliInfo?.found ? (cliInfo.path || '') : '').trim();
    const showDetected = usesCliAuth && inTauri && (cliDetectBusy || !!cliDetect);

    return (
      <div className="space-y-4">
        <div className="flex items-center justify-center gap-3 mb-4">
          <ProviderIcon provider={selectedTemplate} className="w-8 h-8" />
          <h3 className="text-lg font-semibold">
            {selectedTemplate === 'custom' ? t('custom-configuration') : template?.label}
          </h3>
        </div>

        <div className="space-y-4">
          <Card shadow="none" className="bg-secondbackground">
            <CardBody className="space-y-3">
              <div className="flex items-center gap-2 text-sm font-medium text-default-700">
                <Icon icon="hugeicons:settings-02" width="16" height="16" />
                <span>{t('provider-settings-basic')}</span>
              </div>

              <Input
                label={t('provider-name')}
                placeholder={t('enter-provider-name')}
                value={editingProvider.title || ''}
                onValueChange={(value) => {
                  setEditingProvider((prev) => ({ ...prev, title: value }));
                }}
              />
            </CardBody>
          </Card>

          {(isOpenAI || isAnthropic) && (
            <Card shadow="none" className="bg-secondbackground">
              <CardBody className="space-y-3">
                <div className="flex items-center gap-2 text-sm font-medium text-default-700">
                  <Icon icon="hugeicons:shield-user" width="16" height="16" />
                  <span>{t('auth-method')}</span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  <Card
                    shadow="none"
                    isPressable
                    className={`bg-default-50 border ${authMode === 'api-key' ? 'border-primary' : 'border-default-200 hover:border-default-300'}`}
                    onPress={() => setAuthModeValue('api-key')}
                  >
                    <CardBody className="p-3">
                      <div className="flex items-start gap-3">
                        <div className={`mt-0.5 ${authMode === 'api-key' ? 'text-primary' : 'text-default-500'}`}>
                          <Icon icon="hugeicons:key-01" width="18" height="18" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <div className="font-medium">{t('auth-api-key')}</div>
                            {authMode === 'api-key' && (
                              <Chip size="sm" color="primary" variant="flat">
                                {t('active')}
                              </Chip>
                            )}
                          </div>
                          <div className="text-xs text-default-500">{t('auth-api-key-desc')}</div>
                        </div>
                      </div>
                    </CardBody>
                  </Card>

                  <Card
                    shadow="none"
                    isPressable
                    className={`bg-default-50 border ${authMode === 'env' ? 'border-primary' : 'border-default-200 hover:border-default-300'}`}
                    onPress={() => setAuthModeValue('env')}
                  >
                    <CardBody className="p-3">
                      <div className="flex items-start gap-3">
                        <div className={`mt-0.5 ${authMode === 'env' ? 'text-primary' : 'text-default-500'}`}>
                          <Icon icon="hugeicons:code" width="18" height="18" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <div className="font-medium">{t('auth-env-var')}</div>
                            {authMode === 'env' && (
                              <Chip size="sm" color="primary" variant="flat">
                                {t('active')}
                              </Chip>
                            )}
                          </div>
                          <div className="text-xs text-default-500">{t('auth-env-var-desc')}</div>
                        </div>
                      </div>
                    </CardBody>
                  </Card>

                  {isOpenAI && (
                    <Card
                      shadow="none"
                      isPressable
                      className={`bg-default-50 border ${authMode === 'codex-cli' ? 'border-primary' : 'border-default-200 hover:border-default-300'}`}
                      onPress={() => setAuthModeValue('codex-cli')}
                    >
                      <CardBody className="p-3">
                        <div className="flex items-start gap-3">
                          <div className={`mt-0.5 ${authMode === 'codex-cli' ? 'text-primary' : 'text-default-500'}`}>
                            <Icon icon="hugeicons:console" width="18" height="18" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <div className="font-medium">{t('auth-codex-cli')}</div>
                              {authMode === 'codex-cli' && (
                                <Chip size="sm" color="primary" variant="flat">
                                  {t('active')}
                                </Chip>
                              )}
                            </div>
                            <div className="text-xs text-default-500">{t('auth-codex-cli-desc')}</div>
                          </div>
                        </div>
                      </CardBody>
                    </Card>
                  )}

                  {isAnthropic && (
                    <Card
                      shadow="none"
                      isPressable
                      className={`bg-default-50 border ${authMode === 'claude-code-cli' ? 'border-primary' : 'border-default-200 hover:border-default-300'}`}
                      onPress={() => setAuthModeValue('claude-code-cli')}
                    >
                      <CardBody className="p-3">
                        <div className="flex items-start gap-3">
                          <div className={`mt-0.5 ${authMode === 'claude-code-cli' ? 'text-primary' : 'text-default-500'}`}>
                            <Icon icon="hugeicons:console" width="18" height="18" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <div className="font-medium">{t('auth-claude-code-cli')}</div>
                              {authMode === 'claude-code-cli' && (
                                <Chip size="sm" color="primary" variant="flat">
                                  {t('active')}
                                </Chip>
                              )}
                            </div>
                            <div className="text-xs text-default-500">{t('auth-claude-code-cli-desc')}</div>
                          </div>
                        </div>
                      </CardBody>
                    </Card>
                  )}
                </div>

                {usesEnvApiKey && (
                  <div className="space-y-2">
                    <Divider />
                    <Input
                      label={t('env-var-name')}
                      placeholder={isOpenAI ? 'OPENAI_API_KEY' : 'ANTHROPIC_API_KEY'}
                      value={apiKeyEnvVar}
                      onValueChange={(value) => {
                        setEditingProvider((prev) => ({
                          ...prev,
                          config: {
                            ...(prev.config as any || {}),
                            apiKeyEnvVar: value,
                          },
                        }));
                      }}
                    />
                    <div className="text-xs text-default-500 leading-5">{t('auth-env-var-hint')}</div>
                  </div>
                )}

                {usesCliAuth && (
                  <div className="space-y-2">
                    <Divider />
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 text-sm font-medium text-default-700">
                        <Icon icon="hugeicons:console" width="16" height="16" />
                        <span>{t('cli-setup')}</span>
                        <Chip size="sm" color="warning" variant="flat">
                          {t('experimental')}
                        </Chip>
                      </div>
                      <Button
                        size="sm"
                        variant="flat"
                        isDisabled={!inTauri || cliDetectBusy}
                        onPress={runCliDetect}
                      >
                        {t('auto-detect')}
                      </Button>
                    </div>

                    <Input
                      label={t('cli-path')}
                      placeholder={usesCodexCli ? 'codex' : 'claude'}
                      value={cliPath}
                      onValueChange={(value) => {
                        setEditingProvider((prev) => ({
                          ...prev,
                          config: {
                            ...(prev.config as any || {}),
                            cliPath: value,
                          },
                        }));
                      }}
                      endContent={
                        detectedPath && detectedPath !== cliPath.trim() ? (
                          <Button
                            size="sm"
                            variant="light"
                            isDisabled={!inTauri}
                            onPress={() => {
                              setEditingProvider((prev) => ({
                                ...prev,
                                config: {
                                  ...(prev.config as any || {}),
                                  cliPath: detectedPath,
                                },
                              }));
                            }}
                          >
                            {t('use-detected')}
                          </Button>
                        ) : undefined
                      }
                    />

                    <div className="text-xs text-default-500 leading-5">
                      {usesCodexCli ? t('auth-codex-cli-hint') : t('auth-claude-code-cli-hint')}
                    </div>

                    {showDetected && (
                      <div className="rounded-md bg-default-50 border border-default-200 p-3 text-xs text-default-600 leading-5">
                        <div className="font-medium text-default-700 mb-1">{t('auto-detect')}</div>
                        {cliDetectBusy && <div>{t('loading')}</div>}
                        {!cliDetectBusy && cliInfo?.found && (
                          <div className="space-y-1">
                            <div className="font-mono break-all">{cliInfo.path}</div>
                            {cliInfo.version && <div className="text-default-500">{cliInfo.version}</div>}
                          </div>
                        )}
                        {!cliDetectBusy && cliInfo && !cliInfo.found && (
                          <div className="text-warning">{cliInfo.error || t('not-found')}</div>
                        )}
                        {!cliDetectBusy && !cliInfo && <div className="text-default-500">-</div>}
                      </div>
                    )}

                    <div className="rounded-md bg-default-50 border border-default-200 p-3 text-xs text-default-600 leading-5">
                      <div className="font-medium text-default-700 mb-1">{t('cli-requirements')}</div>
                      <div>1. {t('cli-requirements-1')}</div>
                      <div>2. {t('cli-requirements-2')}</div>
                      <div>3. {t('cli-requirements-3')}</div>
                    </div>
                  </div>
                )}
              </CardBody>
            </Card>
          )}

          {!usesCliAuth && (
            <Card shadow="none" className="bg-secondbackground">
              <CardBody className="space-y-3">
                <div className="flex items-center gap-2 text-sm font-medium text-default-700">
                  <Icon icon="hugeicons:link-04" width="16" height="16" />
                  <span>{t('provider-connection')}</span>
                </div>

                <Input
                  label={t('base-url')}
                  placeholder={t('enter-api-base-url')}
                  value={editingProvider.baseURL || ''}
                  onValueChange={(value) => {
                    setEditingProvider((prev) => ({ ...prev, baseURL: value }));
                  }}
                />

                {!usesEnvApiKey && (
                  <Input
                    label={t('api-key')}
                    placeholder={t('enter-api-key')}
                    type="password"
                    value={editingProvider.apiKey || ''}
                    onValueChange={(value) => {
                      setEditingProvider((prev) => ({ ...prev, apiKey: value }));
                    }}
                    endContent={<Copy size={20} content={editingProvider.apiKey ?? ''} />}
                  />
                )}

                {isOllama && (
                  <div className="rounded-md bg-default-50 border border-default-200 p-3 text-xs text-default-600 leading-5">
                    <div className="font-medium text-default-700 mb-1">{t('ollama-local-server')}</div>
                    <div>{t('ollama-local-server-hint')}</div>
                  </div>
                )}
              </CardBody>
            </Card>
          )}

          {(editingProvider.provider === 'azure' || editingProvider.provider === 'azureopenai') && (
            <Card shadow="none" className="bg-secondbackground">
              <CardBody className="space-y-3">
                <div className="flex items-center gap-2 text-sm font-medium text-default-700">
                  <Icon icon="hugeicons:settings-01" width="16" height="16" />
                  <span>{t('advanced')}</span>
                </div>
                <Input
                  label={t('api-version')}
                  placeholder="2024-02-01"
                  value={editingProvider.config?.apiVersion || ''}
                  onValueChange={(value) => {
                    setEditingProvider((prev) => ({
                      ...prev,
                      config: {
                        ...prev.config,
                        apiVersion: value,
                      },
                    }));
                  }}
                />
              </CardBody>
            </Card>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="mx-auto w-full">
      {/* Steps Indicator */}
      <StepsIndicator currentStep={currentStep} totalSteps={2} />

      {/* Content */}
      <div className="min-h-[400px]">
        {currentStep === 1 && renderProviderSelection()}
        {currentStep === 2 && renderConfiguration()}
      </div>

      {/* Navigation */}
      <div className="flex justify-between items-center pt-6 border-t border-default-200">
        <div>
          {currentStep > 1 && (
            <Button
              variant="flat"
              startContent={<Icon icon="hugeicons:arrow-left-02" width="16" height="16" />}
              onPress={() => setCurrentStep(currentStep - 1)}
            >
              {t('back')}
            </Button>
          )}
        </div>

        <div className="flex gap-2">
          {currentStep === 2 && (
            <Button color="primary" onPress={handleSaveProvider}>
              {editingProvider.id ? t('update') : t('create')}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
});
