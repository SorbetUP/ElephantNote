import { observer } from 'mobx-react-lite';
import { Button, Modal, ModalBody, ModalContent, ModalFooter, ModalHeader } from '@heroui/react';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { RootStore } from '@/store';
import { BlinkoStore } from '@/store/blinkoStore';
import { PromiseCall } from '@/store/standard/PromiseState';
import { api } from '@/lib/trpc';
import { useTranslation } from 'react-i18next';
import { ToastPlugin } from '@/store/module/Toast/Toast';
import { Icon } from '@/components/Common/Iconify/icons';
import { AiSettingStore } from '@/store/aiSettingStore';
import { DEFAULT_MODEL_TEMPLATES } from './AiSetting/constants';

interface AIConfig {
    baseUrl?: string;
    apiKey?: string;
    llmModel?: string;
    embeddingModel?: string;
    embeddingDimensions?: number;
}

export const ImportAIDialog = observer(({ onSelectTab }: { onSelectTab?: (tab: string) => void } = {}) => {
    const [searchParams, setSearchParams] = useSearchParams();
    const [isOpen, setIsOpen] = useState(false);
    const [aiConfig, setAiConfig] = useState<AIConfig | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const blinko = RootStore.Get(BlinkoStore);
    const toast = RootStore.Get(ToastPlugin);
    const { t } = useTranslation();

    useEffect(() => {
        const encodedConfig = searchParams.get('v');
        if (encodedConfig) {
            try {
                const decodedConfig = JSON.parse(atob(encodedConfig));
                setAiConfig(decodedConfig);
                setIsOpen(true);

                if (onSelectTab) {
                    onSelectTab('ai');
                }
            } catch (error) {
                console.error('Failed to parse AI config:', error);
            }
        }
    }, [searchParams, onSelectTab]);

    const handleConfirm = async () => {
        if (!aiConfig) return;
        console.log(aiConfig);
        if (!aiConfig.baseUrl || !aiConfig.apiKey || !aiConfig.llmModel || !aiConfig.embeddingModel || !aiConfig.embeddingDimensions) {
            toast.error(t('incomplete-ai-configuration'));
            return;
        }

        try {
            setIsLoading(true);
            const aiSettingStore = RootStore.Get(AiSettingStore);

            // Create OpenAI provider
            await aiSettingStore.createProvider.call({
                title: 'Imported OpenAI Provider',
                provider: 'openai',
                baseURL: aiConfig.baseUrl,
                apiKey: aiConfig.apiKey,
                config: {},
                sortOrder: 0
            });

            // Refresh providers to get the newly created one
            await aiSettingStore.aiProviders.call();
            const createdProvider = aiSettingStore.aiProviders.value?.find(p =>
                p.provider === 'openai' && p.baseURL === aiConfig.baseUrl
            );

            if (!createdProvider) {
                throw new Error('Failed to create provider');
            }

            // Create inference model
            const inferenceTemplate = DEFAULT_MODEL_TEMPLATES.find(t =>
                t.modelKey.toLowerCase() === aiConfig.llmModel?.toLowerCase()
            );
            const inferenceCapabilities = {
                inference: true,
                tools: false,
                image: false,
                imageGeneration: false,
                video: false,
                audio: false,
                embedding: false,
                rerank: false,
                ...inferenceTemplate?.capabilities
            };

            await aiSettingStore.createModel.call({
                title: aiConfig.llmModel,
                modelKey: aiConfig.llmModel,
                providerId: createdProvider.id,
                capabilities: inferenceCapabilities,
                config: {},
                sortOrder: 0
            });

            // Create embedding model
            const embeddingTemplate = DEFAULT_MODEL_TEMPLATES.find(t =>
                t.modelKey.toLowerCase() === aiConfig.embeddingModel?.toLowerCase()
            );
            const embeddingCapabilities = {
                inference: false,
                tools: false,
                image: false,
                imageGeneration: false,
                video: false,
                audio: false,
                embedding: true,
                rerank: false,
                ...embeddingTemplate?.capabilities
            };

            await aiSettingStore.createModel.call({
                title: aiConfig.embeddingModel,
                modelKey: aiConfig.embeddingModel,
                providerId: createdProvider.id,
                capabilities: embeddingCapabilities,
                config: { embeddingDimensions: aiConfig.embeddingDimensions },
                sortOrder: 1
            });

            // Refresh models
            await aiSettingStore.allModels.call();

            // Set the created models as default
            const createdModels = aiSettingStore.allModels.value?.filter(m => m.providerId === createdProvider.id);
            const inferenceModel = createdModels?.find(m => m.capabilities.inference);
            const embeddingModel = createdModels?.find(m => m.capabilities.embedding);

            if (inferenceModel) {
                await api.config.update.mutate({
                    key: 'mainModelId',
                    value: inferenceModel.id,
                });
            }

            if (embeddingModel) {
                await api.config.update.mutate({
                    key: 'embeddingModelId',
                    value: embeddingModel.id,
                });
            }

            toast.success(t('operation-success'));
            searchParams.delete('v');
            setSearchParams(searchParams);
            setIsOpen(false);
        } catch (error) {
            console.error('Failed to import AI config:', error);
            toast.error(t('operation-failed'));
        } finally {
            setIsLoading(false);
        }
    };

    const handleCancel = () => {
        searchParams.delete('v');
        setSearchParams(searchParams);
        setIsOpen(false);
    };

    return (
        <Modal isOpen={isOpen} onClose={handleCancel} placement="center" size="md">
            <ModalContent className="rounded-lg">
                <ModalHeader className="flex items-center gap-2 pb-3">
                    <div className="flex items-center gap-2">
                        <Icon icon="hugeicons:ai-beautify" className="text-primary" width={24} height={24} />
                        <span className="text-lg font-semibold">{t('import-ai-configuration')}</span>
                    </div>
                </ModalHeader>
                <ModalBody className="py-4">
                    <div className="flex flex-col gap-4">
                        <div className="flex items-center gap-2 mb-2">
                            <Icon icon="fluent:info-24-filled" className="text-primary" width={20} height={20} />
                            <p className="text-base">{t('detected-ai-configuration-to-import')}</p>
                        </div>
                        
                        {aiConfig && (
                            <div className="bg-default-50 border border-default-200 p-4 rounded-xl">
                                {aiConfig.baseUrl && (
                                    <div className="flex flex-col mb-3">
                                        <span className="text-sm font-medium text-default-600">{t('api-endpoint')}:</span>
                                        <span className="text-sm font-semibold mt-1 p-2 bg-default-100 rounded-md">{aiConfig.baseUrl}</span>
                                    </div>
                                )}
                                {aiConfig.apiKey && (
                                    <div className="flex flex-col mb-3">
                                        <span className="text-sm font-medium text-default-600">API Key:</span>
                                        <span className="text-sm font-semibold mt-1 p-2 bg-default-100 rounded-md">{'•'.repeat(16)}</span>
                                    </div>
                                )}
                                {aiConfig.llmModel && (
                                    <div className="flex flex-col mb-3">
                                        <span className="text-sm font-medium text-default-600">{t('model')}:</span>
                                        <span className="text-sm font-semibold mt-1 p-2 bg-default-100 rounded-md">{aiConfig.llmModel}</span>
                                    </div>
                                )}
                                {aiConfig.embeddingModel && (
                                    <div className="flex flex-col mb-3">
                                        <span className="text-sm font-medium text-default-600">{t('embedding-model')}:</span>
                                        <span className="text-sm font-semibold mt-1 p-2 bg-default-100 rounded-md">{aiConfig.embeddingModel}</span>
                                    </div>
                                )}
                                {aiConfig.embeddingDimensions && (
                                    <div className="flex flex-col">
                                        <span className="text-sm font-medium text-default-600">{t('embedding-dimensions')}:</span>
                                        <span className="text-sm font-semibold mt-1 p-2 bg-default-100 rounded-md">{aiConfig.embeddingDimensions}</span>
                                    </div>
                                )}
                            </div>
                        )}
                        
                        <div className="flex items-center gap-2 mt-2">
                            <Icon icon="mdi:help-circle-outline" className="text-warning" width={20} height={20} />
                            <p className="text-base">{t('would-you-like-to-import-this-configuration')}</p>
                        </div>
                    </div>
                </ModalBody>
                <ModalFooter className="pt-3">
                    <Button 
                        color="danger" 
                        variant="flat" 
                        onPress={handleCancel} 
                        className="px-6"
                        isDisabled={isLoading}
                    >
                        {t('cancel')}
                    </Button>
                    <Button 
                        color="primary" 
                        onPress={handleConfirm} 
                        className="px-6" 
                        startContent={isLoading ? null : <Icon icon="material-symbols:download" width={18} height={18} />}
                        isLoading={isLoading}
                        spinner={<Icon icon="line-md:loading-twotone-loop" width={24} height={24} />}
                    >
                        {isLoading ? t('importing') : t('import')}
                    </Button>
                </ModalFooter>
            </ModalContent>
        </Modal>
    );
});
