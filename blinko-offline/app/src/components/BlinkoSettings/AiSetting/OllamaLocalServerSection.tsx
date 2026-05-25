import { observer } from 'mobx-react-lite';
import { Button, Input, Card, CardBody, Chip, Progress, Divider } from '@heroui/react';
import { Icon } from '@/components/Common/Iconify/icons';
import { CollapsibleCard } from '../../Common/CollapsibleCard';
import { useTranslation } from 'react-i18next';
import { useEffect, useMemo, useState } from 'react';
import { RootStore } from '@/store';
import { ToastPlugin } from '@/store/module/Toast/Toast';
import { isInTauri } from '@/lib/tauriHelper';
import { Copy } from '@/components/Common/Copy';
import {
  ollamaDeleteModel,
  ollamaInstallManaged,
  ollamaListModels,
  ollamaPullModel,
  ollamaStart,
  ollamaStatus,
  ollamaStop,
  ollamaUpdateManaged,
  type OllamaInstallProgress,
  type OllamaLog,
  type OllamaModelInfo,
  type OllamaPullProgress,
  type OllamaStatus,
} from '@/lib/ollamaManaged';

const DEFAULT_ENDPOINT = 'http://127.0.0.1:11434';

export const OllamaLocalServerSection = observer(function OllamaLocalServerSection() {
  const { t } = useTranslation();
  const toast = RootStore.Get(ToastPlugin);

  const inTauri = isInTauri();
  const [endpointInput, setEndpointInput] = useState(DEFAULT_ENDPOINT);

  const endpoint = useMemo(() => {
    const raw = (endpointInput || '').trim().replace(/\/+$/, '');
    const cleaned = raw.replace(/[\s\u200B\uFEFF\u200E\u200F]+/g, '');
    return cleaned || DEFAULT_ENDPOINT;
  }, [endpointInput]);

  const [ollamaInfo, setOllamaInfo] = useState<{
    status: OllamaStatus | null;
    installProgress: OllamaInstallProgress | null;
    pullProgress: OllamaPullProgress | null;
    logs: string[];
    models: OllamaModelInfo[];
    modelToPull: string;
    busy: boolean;
    showLogs: boolean;
  }>({
    status: null,
    installProgress: null,
    pullProgress: null,
    logs: [],
    models: [],
    modelToPull: '',
    busy: false,
    showLogs: false,
  });

  const refresh = async () => {
    try {
      const status = await ollamaStatus(endpoint);
      setOllamaInfo((prev) => ({ ...prev, status }));
    } catch (e: any) {
      toast.error(e?.message || String(e));
    }
  };

  useEffect(() => {
    if (!inTauri) return;

    let mounted = true;
    const unlisteners: Array<() => void> = [];

    const setup = async () => {
      try {
        const { listen } = await import('@tauri-apps/api/event');

        const un1 = await listen<OllamaInstallProgress>('ollama:install-progress', (event) => {
          if (!mounted) return;
          setOllamaInfo((prev) => ({ ...prev, installProgress: event.payload || null }));
        });
        unlisteners.push(un1);

        const un2 = await listen<OllamaPullProgress>('ollama:pull-progress', (event) => {
          if (!mounted) return;
          setOllamaInfo((prev) => ({ ...prev, pullProgress: event.payload || null }));
        });
        unlisteners.push(un2);

        const un3 = await listen<OllamaLog>('ollama:log', (event) => {
          if (!mounted) return;
          const p = event.payload as OllamaLog;
          if (!p?.line) return;
          setOllamaInfo((prev) => ({
            ...prev,
            logs: [`[${p.stream}] ${p.line}`, ...prev.logs].slice(0, 80),
          }));
        });
        unlisteners.push(un3);
      } catch (e) {
        console.error('Failed to setup Ollama listeners:', e);
      }
    };

    setup();
    refresh();

    return () => {
      mounted = false;
      unlisteners.forEach((fn) => {
        try {
          fn();
        } catch {}
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inTauri]);

  const status = ollamaInfo.status;
  const running = !!status?.running;
  const managedSupported = !!status?.managed_supported;

  const installPercent =
    typeof ollamaInfo.installProgress?.percent === 'number'
      ? Math.max(0, Math.min(100, ollamaInfo.installProgress!.percent!))
      : null;

  const pullPercent =
    typeof ollamaInfo.pullProgress?.completed === 'number' &&
    typeof ollamaInfo.pullProgress?.total === 'number' &&
    ollamaInfo.pullProgress.total > 0
      ? Math.max(0, Math.min(100, (ollamaInfo.pullProgress.completed / ollamaInfo.pullProgress.total) * 100))
      : null;

  return (
    <CollapsibleCard icon="hugeicons:database-01" title={t('ollama-local-server')} decorations={false} defaultCollapsed={true}>
      <div className="space-y-4">
        {!inTauri && (
          <div className="rounded-md border border-default-200 bg-default-50 p-3 text-sm text-default-600">
            {t('ollama-managed-mode-desktop-only')}
          </div>
        )}

        <Card shadow="none" className="bg-secondbackground">
          <CardBody className="space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <div className="font-medium">{t('ollama-integrated-server')}</div>
                  <Chip size="sm" color={running ? 'success' : 'default'} variant="flat">
                    {running ? t('ollama-status-running') : t('ollama-status-stopped')}
                  </Chip>
                  {status?.managed_installed ? (
                    <Chip size="sm" color="primary" variant="flat">
                      {t('installed')}
                    </Chip>
                  ) : (
                    <Chip size="sm" color="warning" variant="flat">
                      {t('not-installed')}
                    </Chip>
                  )}
                </div>

                <div className="mt-2">
                  <Input
                    label={t('base-url')}
                    value={endpointInput}
                    onValueChange={setEndpointInput}
                    description={t('ollama-local-server-hint')}
                    endContent={<Copy size={18} content={endpoint} />}
                  />
                </div>

                <div className="mt-2 grid grid-cols-1 md:grid-cols-3 gap-2 text-xs text-default-600">
                  <div className="rounded-md bg-default-50 border border-default-200 p-2">
                    <div className="text-default-500">{t('server-version')}</div>
                    <div className="font-mono">{status?.server_version ? `v${status.server_version}` : '-'}</div>
                  </div>
                  <div className="rounded-md bg-default-50 border border-default-200 p-2">
                    <div className="text-default-500">{t('managed-version')}</div>
                    <div className="font-mono">{status?.managed_version ? `v${status.managed_version}` : '-'}</div>
                  </div>
                  <div className="rounded-md bg-default-50 border border-default-200 p-2">
                    <div className="text-default-500">{t('latest-version')}</div>
                    <div className="font-mono">{status?.latest_version ? `v${status.latest_version}` : '-'}</div>
                  </div>
                </div>
              </div>

              <div className="flex flex-col items-end gap-2 shrink-0">
                <Button size="sm" variant="flat" isDisabled={!inTauri || ollamaInfo.busy} onPress={refresh}>
                  {t('refresh')}
                </Button>
              </div>
            </div>

            {status?.last_error && (
              <div className="rounded-md border border-danger-200 bg-danger-50 p-3 text-xs text-danger-700">
                <div className="flex items-center gap-2 font-medium">
                  <Icon icon="hugeicons:alert-02" width="14" height="14" />
                  <span>{t('error')}</span>
                </div>
                <div className="mt-1 font-mono whitespace-pre-wrap break-words">{status.last_error}</div>
              </div>
            )}

            {status && !managedSupported && (
              <div className="rounded-md border border-warning-200 bg-warning-50 p-3 text-xs text-warning-700">
                {t('ollama-managed-not-supported')}
              </div>
            )}

            <Divider />

            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <Button
                size="sm"
                variant="flat"
                isDisabled={!inTauri || ollamaInfo.busy || !managedSupported || running}
                onPress={async () => {
                  try {
                    setOllamaInfo((prev) => ({ ...prev, busy: true, installProgress: null }));
                    const s = await ollamaInstallManaged();
                    setOllamaInfo((prev) => ({ ...prev, status: s }));
                    await refresh();
                  } catch (e: any) {
                    toast.error(e?.message || String(e));
                  } finally {
                    setOllamaInfo((prev) => ({ ...prev, busy: false }));
                  }
                }}
              >
                {t('install')}
              </Button>

              <Button
                size="sm"
                variant="flat"
                isDisabled={!inTauri || ollamaInfo.busy || !managedSupported || running}
                onPress={async () => {
                  try {
                    setOllamaInfo((prev) => ({ ...prev, busy: true, installProgress: null }));
                    const s = await ollamaUpdateManaged();
                    setOllamaInfo((prev) => ({ ...prev, status: s }));
                    await refresh();
                  } catch (e: any) {
                    toast.error(e?.message || String(e));
                  } finally {
                    setOllamaInfo((prev) => ({ ...prev, busy: false }));
                  }
                }}
              >
                {t('update')}
              </Button>

              <Button
                size="sm"
                color="primary"
                isDisabled={!inTauri || ollamaInfo.busy}
                onPress={async () => {
                  try {
                    setOllamaInfo((prev) => ({ ...prev, busy: true }));
                    const s = await ollamaStart(endpoint);
                    setOllamaInfo((prev) => ({ ...prev, status: s }));
                  } catch (e: any) {
                    toast.error(e?.message || String(e));
                  } finally {
                    setOllamaInfo((prev) => ({ ...prev, busy: false }));
                  }
                }}
              >
                {t('start')}
              </Button>

              <Button
                size="sm"
                color="danger"
                variant="flat"
                isDisabled={!inTauri || ollamaInfo.busy}
                onPress={async () => {
                  try {
                    setOllamaInfo((prev) => ({ ...prev, busy: true }));
                    const s = await ollamaStop();
                    setOllamaInfo((prev) => ({ ...prev, status: s }));
                  } catch (e: any) {
                    toast.error(e?.message || String(e));
                  } finally {
                    setOllamaInfo((prev) => ({ ...prev, busy: false }));
                  }
                }}
              >
                {t('stop')}
              </Button>
            </div>

            {ollamaInfo.installProgress && (
              <div className="space-y-2">
                <div className="text-xs text-default-500">
                  {t('progress')}: {ollamaInfo.installProgress.stage} - {ollamaInfo.installProgress.message}
                </div>
                <Progress size="sm" value={installPercent ?? undefined} isIndeterminate={installPercent == null} color="primary" />
              </div>
            )}

            <Divider />

            <div className="space-y-3">
              <div className="flex items-end gap-2">
                <Input
                  label={t('ollama-model-to-pull')}
                  placeholder="llama3.2"
                  value={ollamaInfo.modelToPull}
                  onValueChange={(value) => setOllamaInfo((prev) => ({ ...prev, modelToPull: value }))}
                />

                <Button
                  size="sm"
                  color="primary"
                  isDisabled={!inTauri || ollamaInfo.busy || !ollamaInfo.modelToPull.trim()}
                  onPress={async () => {
                    try {
                      setOllamaInfo((prev) => ({ ...prev, busy: true, pullProgress: null }));
                      await ollamaPullModel(endpoint, ollamaInfo.modelToPull);
                      const models = await ollamaListModels(endpoint);
                      setOllamaInfo((prev) => ({ ...prev, models }));
                    } catch (e: any) {
                      toast.error(e?.message || String(e));
                    } finally {
                      setOllamaInfo((prev) => ({ ...prev, busy: false }));
                    }
                  }}
                >
                  {t('pull')}
                </Button>

                <Button
                  size="sm"
                  variant="flat"
                  isDisabled={!inTauri || ollamaInfo.busy}
                  onPress={async () => {
                    try {
                      setOllamaInfo((prev) => ({ ...prev, busy: true }));
                      const models = await ollamaListModels(endpoint);
                      setOllamaInfo((prev) => ({ ...prev, models }));
                    } catch (e: any) {
                      toast.error(e?.message || String(e));
                    } finally {
                      setOllamaInfo((prev) => ({ ...prev, busy: false }));
                    }
                  }}
                >
                  {t('list')}
                </Button>
              </div>

              {ollamaInfo.pullProgress && (
                <div className="space-y-2">
                  <div className="text-xs text-default-500">
                    {t('progress')}: {ollamaInfo.pullProgress.status || ''}
                  </div>
                  <Progress
                    size="sm"
                    value={pullPercent ?? undefined}
                    isIndeterminate={pullPercent == null && !ollamaInfo.pullProgress.done}
                    color="primary"
                  />
                </div>
              )}

              {ollamaInfo.models.length > 0 && (
                <div className="space-y-2">
                  <div className="text-xs text-default-500">
                    {t('installed-models')} ({ollamaInfo.models.length})
                  </div>
                  <div className="max-h-56 overflow-auto rounded-md border border-default-200 bg-default-50">
                    <div className="flex flex-col divide-y divide-default-200">
                      {ollamaInfo.models.slice(0, 50).map((m) => (
                        <div key={m.name} className="flex items-center justify-between gap-3 p-2 text-xs">
                          <div className="min-w-0">
                            <div className="font-mono truncate">{m.name}</div>
                            <div className="text-[11px] text-default-500">
                              {m.size ? `${Math.round(m.size / (1024 * 1024))}MB` : ''}
                            </div>
                          </div>
                          <Button
                            size="sm"
                            color="danger"
                            variant="light"
                            isDisabled={!inTauri || ollamaInfo.busy}
                            onPress={async () => {
                              try {
                                setOllamaInfo((prev) => ({ ...prev, busy: true }));
                                await ollamaDeleteModel(endpoint, m.name);
                                const models = await ollamaListModels(endpoint);
                                setOllamaInfo((prev) => ({ ...prev, models }));
                              } catch (e: any) {
                                toast.error(e?.message || String(e));
                              } finally {
                                setOllamaInfo((prev) => ({ ...prev, busy: false }));
                              }
                            }}
                          >
                            {t('delete')}
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                  {ollamaInfo.models.length > 50 && (
                    <div className="text-xs text-default-400">{t('showing-first-n', { n: 50 })}</div>
                  )}
                </div>
              )}
            </div>

            <Divider />

            <div className="flex items-center justify-between">
              <div className="text-sm font-medium text-default-700">{t('logs')}</div>
              <Button
                size="sm"
                variant="flat"
                isDisabled={!inTauri}
                onPress={() => setOllamaInfo((prev) => ({ ...prev, showLogs: !prev.showLogs }))}
              >
                {ollamaInfo.showLogs ? t('hide') : t('show')}
              </Button>
            </div>

            {ollamaInfo.showLogs && (
              <div className="max-h-48 overflow-auto rounded-md bg-default-50 border border-default-200 p-2 text-[11px] font-mono text-default-700">
                {ollamaInfo.logs.length === 0 ? (
                  <div className="text-default-500">{t('no-data')}</div>
                ) : (
                  ollamaInfo.logs.map((l, idx) => (
                    <div key={idx} className="whitespace-pre-wrap break-words">
                      {l}
                    </div>
                  ))
                )}
              </div>
            )}
          </CardBody>
        </Card>
      </div>
    </CollapsibleCard>
  );
});
