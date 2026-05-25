import { observer } from 'mobx-react-lite';
import { Slider, Button } from '@heroui/react';
import { Icon } from '@/components/Common/Iconify/icons';
import { CollapsibleCard } from '../../Common/CollapsibleCard';
import { useTranslation } from 'react-i18next';
import { useState, useEffect, useRef } from 'react';
import { RootStore } from '@/store';
import { BlinkoStore } from '@/store/blinkoStore';
import { PromiseCall } from '@/store/standard/PromiseState';
import { api } from '@/lib/trpc';
import { Item, ItemWithTooltip } from '../Item';
import TagSelector from '@/components/Common/TagSelector';
import { useMediaQuery } from 'usehooks-ts';
import { showTipsDialog } from '@/components/Common/TipsDialog';
import { ShowRebuildEmbeddingProgressDialog } from '@/components/Common/RebuildEmbeddingProgress';

export const EmbeddingSettingsSection = observer(function EmbeddingSettingsSection() {
  const { t } = useTranslation();
  const blinko = RootStore.Get(BlinkoStore);
  const isPc = useMediaQuery('(min-width: 768px)');

  const [localState, setLocalState] = useState({
    embeddingTopK: blinko.config.value?.embeddingTopK ?? 5,
    embeddingScore: blinko.config.value?.embeddingScore ?? 0.6,
    excludeEmbeddingTagId: blinko.config.value?.excludeEmbeddingTagId
  });

  // Rebuild embedding state
  const [rebuildProgress, setRebuildProgress] = useState<{ percentage: number; isRunning: boolean } | null>(null);
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const fetchRebuildProgress = async () => {
    try {
      const data = await api.ai.rebuildEmbeddingProgress.query();
      if (data) {
        setRebuildProgress({
          percentage: data.percentage,
          isRunning: data.isRunning,
        });

        if (data.isRunning && !pollingIntervalRef.current) {
          startPolling();
        } else if (!data.isRunning && pollingIntervalRef.current) {
          stopPolling();
        }
      }
    } catch (error) {
      console.error('Error fetching rebuild progress:', error);
    }
  };

  const startPolling = () => {
    if (pollingIntervalRef.current) return;
    pollingIntervalRef.current = setInterval(fetchRebuildProgress, 2000);
  };

  const stopPolling = () => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }
  };

  useEffect(() => {
    fetchRebuildProgress();
    return () => stopPolling();
  }, []);


  const handleRebuildClick = async () => {
    try {
      // Check the latest status from database
      const latestProgress = await api.ai.rebuildEmbeddingProgress.query();

      if (latestProgress?.isRunning) {
        // Task is already running, show progress dialog
        setRebuildProgress({
          percentage: latestProgress.percentage,
          isRunning: true,
        });
        ShowRebuildEmbeddingProgressDialog(true);
        startPolling();
      } else {
        // No task running, show confirmation dialog for new rebuild
        showTipsDialog({
          title: t('force-rebuild-embedding-index'),
          content: t('if-you-have-a-lot-of-notes-you-may-consume-a-certain-number-of-tokens'),
          onConfirm: async () => {
            ShowRebuildEmbeddingProgressDialog(true);
            await api.ai.rebuildEmbeddingStart.mutate({ force: true, incremental: false });
            setRebuildProgress({
              percentage: 0,
              isRunning: true,
            });
            startPolling();
          },
        });
      }
    } catch (error) {
      console.error('Failed to check rebuild status:', error);
    }
  };


  return (
    <CollapsibleCard icon="hugeicons:database-01" title="Embedding Management" decorations={false}>
      <div className="space-y-4">
        <Item
          type={isPc ? 'row' : 'col'}
          leftContent={
            <ItemWithTooltip
              content={<>Top K</>}
              toolTipContent={
                <div className="md:w-[300px] flex flex-col gap-2">
                  <div>{t('top-k-description')}</div>
                </div>
              }
            />
          }
          rightContent={
            <div className="flex md:w-[300px] w-full ml-auto justify-start">
              <Slider
                onChangeEnd={(value) => {
                  PromiseCall(
                    api.config.update.mutate({
                      key: 'embeddingTopK',
                      value: localState.embeddingTopK,
                    }),
                    { autoAlert: false },
                  );
                }}
                onChange={(value) => {
                  const newValue = Number(value);
                  setLocalState(prev => ({ ...prev, embeddingTopK: newValue }));
                }}
                value={localState.embeddingTopK}
                size="md"
                step={1}
                color="foreground"
                label={'value'}
                showSteps={false}
                maxValue={50}
                minValue={1}
                defaultValue={5}
                className="w-full"
              />
            </div>
          }
        />

        <Item
          type={isPc ? 'row' : 'col'}
          leftContent={
            <ItemWithTooltip
              content={<>Score</>}
              toolTipContent={
                <div className="md:w-[300px] flex flex-col gap-2">
                  <div>{t('embedding-score-description')}</div>
                </div>
              }
            />
          }
          rightContent={
            <div className="flex md:w-[300px] w-full ml-auto justify-start">
              <Slider
                onChangeEnd={(value) => {
                  PromiseCall(
                    api.config.update.mutate({
                      key: 'embeddingScore',
                      value: localState.embeddingScore,
                    }),
                    { autoAlert: false },
                  );
                }}
                onChange={(value) => {
                  const newValue = Number(value);
                  setLocalState(prev => ({ ...prev, embeddingScore: newValue }));
                }}
                value={localState.embeddingScore}
                size="md"
                step={0.01}
                color="foreground"
                label={'value'}
                showSteps={false}
                maxValue={1.0}
                minValue={0.2}
                defaultValue={0.6}
                className="w-full"
              />
            </div>
          }
        />

        <Item
          type={isPc ? 'row' : 'col'}
          leftContent={
            <div className="flex flex-col gap-1">
              <ItemWithTooltip
                content={<>{t('exclude-tag-from-embedding')}</>}
                toolTipContent={t('exclude-tag-from-embedding-tip')}
              />
              <div className="text-desc text-xs">{t('exclude-tag-from-embedding-desc')}</div>
            </div>
          }
          rightContent={
            <TagSelector
              selectedTag={localState.excludeEmbeddingTagId?.toString() || null}
              onSelectionChange={(key) => {
                const newValue = key ? Number(key) : null;
                setLocalState(prev => ({ ...prev, excludeEmbeddingTagId: newValue }));
                PromiseCall(
                  api.config.update.mutate({
                    key: 'excludeEmbeddingTagId',
                    value: newValue,
                  }),
                  { autoAlert: false },
                );
              }}
            />
          }
        />

        {/* Rebuild Embedding Section */}
        <Item
          type={isPc ? 'row' : 'col'}
          leftContent={
            <div className="flex flex-col gap-1">
              <ItemWithTooltip
                content={<>{t('rebuild-embedding-index')}</>}
                toolTipContent={t('if-you-have-a-lot-of-notes-you-may-consume-a-certain-number-of-tokens')}
              />
              <div className="text-desc text-xs">{t('notes-imported-by-other-means-may-not-have-embedded-vectors')}</div>
            </div>
          }
          rightContent={
            <Button
              color="danger"
              variant="flat"
              startContent={
                rebuildProgress?.isRunning ? (
                  <div className="flex items-center gap-1">
                    <Icon icon="line-md:loading-twotone-loop" width="16" height="16" />
                    {rebuildProgress?.percentage || 0}%
                  </div>
                ) : (
                  <Icon icon="mingcute:refresh-4-ai-line" width="16" height="16" />
                )
              }
              onPress={handleRebuildClick}
            >
              {rebuildProgress?.isRunning ? t('rebuild-in-progress') : t('force-rebuild')}
            </Button>
          }
        />
      </div>
    </CollapsibleCard>
  );
});
