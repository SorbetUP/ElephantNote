import { observer } from 'mobx-react-lite';
import { Card, CardBody, Button, Chip, Select, SelectItem } from '@heroui/react';
import { Icon } from '@/components/Common/Iconify/icons';
import { useTranslation } from 'react-i18next';
import { useState, useEffect } from 'react';
import { RootStore } from '@/store';
import { DialogStore } from '@/store/module/Dialog';
import ProviderDialogContent from './ProviderDialogContent';
import ModelDialogContent from './ModelDialogContent';
import { ProviderIcon, ModelIcon } from '@/components/BlinkoSettings/AiSetting/AIIcon';
import { useMediaQuery } from 'usehooks-ts';
import { CAPABILITY_ICONS, CAPABILITY_LABELS, CAPABILITY_COLORS, PROVIDER_TEMPLATES } from './constants';
import { showTipsDialog } from '@/components/Common/TipsDialog';
import { DialogStandaloneStore } from '@/store/module/DialogStandalone';
import { ToastPlugin } from '@/store/module/Toast/Toast';
import { api } from '@/lib/trpc';
import { AiProvider, AiSettingStore, ModelCapabilities } from '@/store/aiSettingStore';

// Utility function to format test connection results
const formatTestResults = (result: any, t: (key: string) => string): string => {
  const details: string[] = [];

  if (result?.capabilities?.inference?.success) {
    const response = result.capabilities.inference.response || '';
    details.push(`${response}`);
  }

  if (result?.capabilities?.embedding?.success) {
    const dimensions = result.capabilities.embedding.dimensions || 0;
    details.push(`${dimensions} dimensions`);
  }

  if (result?.capabilities?.audio?.success) {
    const message = result.capabilities.audio.message || '';
    details.push(`${message}`);
  }

  return `${t('check-connect-success')} - ${details.join(', ')}`;
};


interface ProviderCardProps {
  provider: AiProvider;
}

export default observer(function ProviderCard({ provider }: ProviderCardProps) {
  const { t } = useTranslation();
  const aiSettingStore = RootStore.Get(AiSettingStore);
  const isMobile = useMediaQuery('(max-width: 768px)');
  const [isModelsCollapsed, setIsModelsCollapsed] = useState(false);
  const [selectedModel, setSelectedModel] = useState('');
  const [availableModels, setAvailableModels] = useState<any[]>([]);
  const providerType = (provider.provider || '').toLowerCase();
  const authMode = (provider.config as any)?.authMode as string | undefined;
  const ollamaManaged = (provider.config as any)?.ollamaManaged as boolean | undefined;

  const authModeLabel =
    authMode === 'env'
      ? t('auth-env-var')
      : authMode === 'codex-cli'
        ? t('auth-codex-cli')
        : authMode === 'claude-code-cli'
          ? t('auth-claude-code-cli')
          : authMode
            ? t('auth-api-key')
            : null;

  // Load collapse state from localStorage
  useEffect(() => {
    const saved = localStorage.getItem(`provider-${provider.id}-collapsed`);
    if (saved !== null) {
      setIsModelsCollapsed(JSON.parse(saved));
    }
  }, [provider.id]);

  // Save collapse state to localStorage
  const toggleModelsCollapse = () => {
    const newState = !isModelsCollapsed;
    setIsModelsCollapsed(newState);
    localStorage.setItem(`provider-${provider.id}-collapsed`, JSON.stringify(newState));
  };

  const handleDeleteProvider = async (id: number) => {
    showTipsDialog({
      title: t('confirm-to-delete'),
      content: t('this-operation-removes-the-associated-label-and-cannot-be-restored-please-confirm'),
      onConfirm: async () => {
        await aiSettingStore.deleteProvider.call(id);
        RootStore.Get(DialogStandaloneStore).close();
      }
    });

  };

  const handleDeleteModel = async (id: number, providerId: number) => {
    // if (!confirm('Are you sure you want to delete this model?')) return;
    showTipsDialog({
      title: t('confirm-to-delete'),
      content: t('this-operation-removes-the-associated-label-and-cannot-be-restored-please-confirm'),
      onConfirm: async () => {
        await aiSettingStore.deleteModel.call({ id });
        RootStore.Get(DialogStandaloneStore).close();
      }
    });

  };

  const renderCapabilityChips = (capabilities: ModelCapabilities) => {
    return Object.entries(capabilities)
      .filter(([_, enabled]) => enabled)
      .map(([capability]) => (
        <Chip
          key={capability}
          size="sm"
          startContent={CAPABILITY_ICONS[capability as keyof ModelCapabilities]}
          variant="solid"
          className='text-white'
          color={CAPABILITY_COLORS[capability as keyof ModelCapabilities]}
        >
          {CAPABILITY_LABELS[capability as keyof ModelCapabilities]}
        </Chip>
      ));
  };

  return (
    <Card className="bg-secondbackground group" shadow='none'>
      <CardBody>
        <div className={`flex ${isMobile ? 'flex-col space-y-3' : 'justify-between items-start'} mb-3`}>
          <div className="flex items-center gap-3">
            <div className="relative">
              <ProviderIcon
                provider={provider.provider === 'custom' ? 'openai' : provider.provider}
                className="w-8 h-8"
              />
              {provider.provider === 'custom' && (
                <div className="absolute -bottom-1 -right-1 w-3 h-3 bg-primary rounded-full flex items-center justify-center">
                  <Icon icon="hugeicons:settings-03" className="w-2 h-2 text-white" />
                </div>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-lg font-bold truncate">{provider.title}</h3>
              <div className="flex flex-wrap items-center gap-1 mt-1">
                {!!authModeLabel && (
                  <Chip size="sm" variant="flat" color="primary">
                    {authModeLabel}
                  </Chip>
                )}
                {providerType === 'ollama' && ollamaManaged && (
                  <Chip size="sm" variant="flat" color="success">
                    {t('ollama-managed-mode')}
                  </Chip>
                )}
              </div>
              {!!provider.baseURL && !authMode?.endsWith('-cli') && (
                <p className="text-tiny text-gray-400 truncate mt-1">{provider.baseURL}</p>
              )}
            </div>
          </div>
          <div className={`flex gap-2 ${isMobile ? 'self-end' : 'self-end'}`}>
            <Button
              size="sm"
              variant="flat"
              isIconOnly
              startContent={<Icon icon="hugeicons:settings-02" width="16" height="16" />}
              onPress={() => {
                RootStore.Get(DialogStore).setData({
                  isOpen: true,
                  size: isMobile ? 'full' : '2xl',
                  title: 'Edit Provider',
                  content: <ProviderDialogContent provider={provider} />,
                });
              }}
            >
            </Button>
            <Button
              size="sm"
              color="danger"
              isIconOnly
              variant="flat"
              startContent={<Icon icon="hugeicons:delete-01" width="16" height="16" />}
              onPress={() => handleDeleteProvider(provider.id)}
            >
            </Button>
          </div>
        </div>

        {/* Models Section */}
        <div className="space-y-3">
          <div className={`flex justify-between items-center`}>
            <h4 className="text-sm font-semibold text-default-600">
              {t('model')} {provider.models && provider.models.length > 0 && (
                <span className="text-xs bg-default-100 text-default-500 px-2 py-1 rounded-full ml-2">
                  {provider.models.length}
                </span>
              )}
            </h4>
            <div className={`flex gap-2 ${isMobile ? 'self-end' : ''}`}>
              <Button
                size="sm"
                variant='light'
                color="primary"
                startContent={<Icon icon="hugeicons:add-01" width="14" height="14" />}
                onPress={() => {
                  RootStore.Get(DialogStore).setData({
                    isOpen: true,
                    size: isMobile ? 'full' : '2xl',
                    title: `Add Model to ${provider.title}`,
                    content: <ModelDialogContent model={{
                      id: 0,
                      providerId: provider.id,
                      title: '',
                      modelKey: '',
                      capabilities: {
                        inference: true,
                        tools: false,
                        image: false,
                        imageGeneration: false,
                        video: false,
                        audio: false,
                        embedding: false,
                        rerank: false
                      },
                      sortOrder: 0,
                      createdAt: new Date(),
                      updatedAt: new Date()
                    }} />,
                  });
                }}
              >
                {t('create-model')}
              </Button>
              <Button
                size="sm"
                variant="flat"
                isIconOnly
                startContent={<Icon icon={isModelsCollapsed ? "hugeicons:arrow-down-01" : "hugeicons:arrow-up-01"} width="14" height="14" />}
                onPress={toggleModelsCollapse}
              />
            </div>
          </div>

          {/* Model Selection Dropdown - Only show when models are fetched but not collapsed */}
          {availableModels.length > 0 && !isModelsCollapsed && (
            <div className="mb-3">
              <Select
                size="sm"
                label=""
                placeholder=""
                selectedKeys={selectedModel ? [selectedModel] : []}
                onSelectionChange={(keys) => {
                  const value = Array.from(keys)[0];
                  if (value) {
                    setSelectedModel(String(value));
                    const model = availableModels.find(m => m.id === value);
                    if (model) {
                      RootStore.Get(DialogStore).setData({
                        isOpen: true,
                        size: isMobile ? 'full' : '3xl',
                        title: `Add ${model.name} to ${provider.title}`,
                        content: <ModelDialogContent model={{
                          id: 0,
                          providerId: provider.id,
                          title: model.name,
                          modelKey: model.id,
                          capabilities: aiSettingStore.inferModelCapabilities(model.id),
                          sortOrder: 0,
                          createdAt: new Date(),
                          updatedAt: new Date()
                        }} />,
                      });
                      setSelectedModel('');
                    }
                  }
                }}
                className="w-full"
              >
                {availableModels.map(model => (
                  <SelectItem key={model.id}>
                    {model.name}
                  </SelectItem>
                ))}
              </Select>
            </div>
          )}

          {/* Models List */}
          {!isModelsCollapsed && (
            <div className="space-y-2">
              {provider.models && provider.models.length > 0 ? (
                provider.models.map(model => (
                  <div key={model.id} className={`${isMobile ? 'block' : 'flex items-center'} gap-3 p-3 bg-default-50 rounded-lg hover:bg-default-100 transition-colors group`}>
                    {/* Mobile Layout */}
                    {isMobile ? (
                      <div className="space-y-2">
                        <div className="flex items-center gap-3">
                          <ModelIcon modelName={model.modelKey} className="w-8 h-8" />
                          <div className="flex-1 min-w-0">
                            <h5 className="font-medium text-sm truncate">{model.title}</h5>
                            <p className="text-xs text-default-500 truncate">{model.modelKey}</p>
                          </div>
                          <div className="flex gap-1">
                            <Button
                              size="sm"
                              variant="flat"
                              isIconOnly
                              startContent={<Icon icon="hugeicons:connect" width="12" height="12" />}
                              onPress={() => {
                                RootStore.Get(ToastPlugin).promise(
                                  api.ai.testConnect.mutate({
                                    providerId: model.providerId,
                                    modelKey: model.modelKey,
                                    capabilities: model.capabilities
                                  }),
                                  {
                                    loading: t('loading'),
                                    success: (result: any) => formatTestResults(result, t),
                                    error: (error: any) => `${t('check-connect-error')}: ${error.message}`,
                                  }
                                );
                              }}
                            />
                            <Button
                              size="sm"
                              variant="flat"
                              isIconOnly
                              startContent={<Icon icon="hugeicons:settings-02" width="12" height="12" />}
                              onPress={() => {
                                RootStore.Get(DialogStore).setData({
                                  isOpen: true,
                                  size: 'full',
                                  title: 'Edit Model',
                                  content: <ModelDialogContent model={model} />,
                                });
                              }}
                            />
                            <Button
                              size="sm"
                              color="danger"
                              variant="flat"
                              isIconOnly
                              startContent={<Icon icon="hugeicons:delete-01" width="12" height="12" />}
                              onPress={() => handleDeleteModel(model.id, model.providerId)}
                            />
                          </div>
                        </div>
                        <div className="flex gap-1 flex-wrap">
                          {renderCapabilityChips(model.capabilities)}
                        </div>
                      </div>
                    ) : (
                      /* Desktop Layout */
                      <>
                        {/* Model Icon */}
                        <div className="flex-shrink-0">
                          <ModelIcon modelName={model.modelKey} className="w-6 h-6" />
                        </div>

                        {/* Model Info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <h5 className="font-bold text-sm truncate">{model.title}</h5>
                            <div className="flex gap-1">
                              {renderCapabilityChips(model.capabilities)}
                            </div>
                          </div>
                          <p className="text-xs text-default-500 truncate">{model.modelKey}</p>
                        </div>

                        {/* Actions */}
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button
                            size="sm"
                            variant="flat"
                            isIconOnly
                            startContent={<Icon icon="hugeicons:connect" width="12" height="12" />}
                            onPress={() => {
                              RootStore.Get(ToastPlugin).promise(
                                api.ai.testConnect.mutate({
                                  providerId: model.providerId,
                                  modelKey: model.modelKey,
                                  capabilities: model.capabilities
                                }),
                                {
                                  loading: t('loading'),
                                  success: (result: any) => formatTestResults(result, t),
                                  error: (error: any) => `${t('check-connect-error')}: ${error.message}`,
                                }
                              );
                            }}
                          />
                          <Button
                            size="sm"
                            variant="flat"
                            isIconOnly
                            startContent={<Icon icon="hugeicons:settings-02" width="12" height="12" />}
                            onPress={() => {
                              RootStore.Get(DialogStore).setData({
                                isOpen: true,
                                size: '3xl',
                                title: 'Edit Model',
                                content: <ModelDialogContent model={model} />,
                              });
                            }}
                          />
                          <Button
                            size="sm"
                            color="danger"
                            variant="flat"
                            isIconOnly
                            startContent={<Icon icon="hugeicons:delete-01" width="12" height="12" />}
                            onPress={() => handleDeleteModel(model.id, model.providerId)}
                          />
                        </div>
                      </>
                    )}
                  </div>
                ))
              ) : (
                <div className="text-center py-8 text-default-400">
                  <Icon icon="hugeicons:file-search" className="w-12 h-12 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">{t('no-data')}</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Documentation and Website Links */}
        {(() => {
          const template = PROVIDER_TEMPLATES.find(t => t.value === provider.provider.toLowerCase());
          if (template && (template.website || template.docs)) {
            return (
              <div className="mt-4 pt-3 border-t border-default-200">
                <p className="text-xs text-default-400">
                  {t('view-provider-info', {
                    provider: template.label,
                    docs: template.docs ? '' : '',
                    website: template.website ? '' : '',
                    separator: template.docs && template.website ? "" : ''
                  })}
                  {template.docs && (
                    <>
                      {' '}
                      <a
                        href={template.docs}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:text-primary-600 underline cursor-pointer"
                      >
                        {t('documentation')}
                      </a>
                    </>
                  )}
                  {template.docs && template.website && (
                    <span> {t('and')} </span>
                  )}
                  {template.website && (
                    <a
                      href={template.website}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:text-primary-600 underline cursor-pointer"
                    >
                      {t('website')}
                    </a>
                  )}
                  {' '}
                  {t('for-more-info')}
                </p>
              </div>
            );
          }
          return null;
        })()}
      </CardBody>
    </Card>
  );
});
