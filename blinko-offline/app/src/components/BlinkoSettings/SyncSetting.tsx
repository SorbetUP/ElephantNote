import { useEffect, useMemo, useState } from 'react';
import { Button, Input, Modal, ModalBody, ModalContent, ModalFooter, ModalHeader, Select, SelectItem, Switch } from '@heroui/react';
import { observer } from 'mobx-react-lite';
import { saveBlinkoEndpoint } from '@/lib/blinkoEndpoint';
import { isInTauri } from '@/lib/tauriHelper';
import { invoke } from '@tauri-apps/api/core';
import { useTranslation } from 'react-i18next';
import { eventBus } from '@/lib/event';
import { showTipsDialog } from '@/components/Common/TipsDialog';
import { RootStore } from '@/store';
import { DialogStandaloneStore } from '@/store/module/DialogStandalone';
import { MarkdownRender } from '@/components/Common/MarkdownRender';

type EndpointDraft = {
  key: string;
  id: string;
  url: string;
  token: string;
  originalId: string;
};

type SyncStatusEndpoint = {
  id: string;
  url: string;
  last_pull_cursor: string | null;
  last_push_cursor: string | null;
  last_sync_at: string | null;
  status: string | null;
  outbox_pending_count: number | null;
  outbox_pushed_count: number | null;
  pending_attachment_uploads_count: number | null;
  last_attachment_upload_error: string | null;
};

type ConflictSummary = {
  id: number;
  entity_type: string;
  entity_id: string;
  created_at: string;
};

type ConflictDetail = {
  id: number;
  entity_type: string;
  entity_id: string;
  local_payload: string | null;
  remote_payload: string | null;
  resolved_payload: string | null;
  created_at: string;
};

type SyncSettingProps = {
  onSelectedEndpointChange?: (endpoint: { id: string; url: string; token: string } | null) => void;
};

const INTERVAL_OPTIONS: Array<{ secs: number; key: string }> = [
  { secs: 60, key: 'sync-interval-1m' },
  { secs: 300, key: 'sync-interval-5m' },
  { secs: 900, key: 'sync-interval-15m' },
  { secs: 1800, key: 'sync-interval-30m' },
];

export const SyncSetting = observer((props: SyncSettingProps) => {
  const { t } = useTranslation();

  const [endpoints, setEndpoints] = useState<EndpointDraft[]>([]);
  const [selectedEndpointKey, setSelectedEndpointKey] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [testingIds, setTestingIds] = useState<Record<string, boolean>>({});
  const [testStatus, setTestStatus] = useState<Record<string, 'idle' | 'ok' | 'error'>>({});
  const [testMessage, setTestMessage] = useState<Record<string, string>>({});
  const [allowInsecureHttp, setAllowInsecureHttp] = useState(false);
  const [syncAuto, setSyncAuto] = useState(true);
  const [syncIntervalSecs, setSyncIntervalSecs] = useState<number>(300);
  const [localBaseUrl, setLocalBaseUrl] = useState<string>('');
  const [localApiToken, setLocalApiToken] = useState<string>('');
  const [statusRows, setStatusRows] = useState<SyncStatusEndpoint[]>([]);
  const [saveError, setSaveError] = useState<string>('');

  const [conflicts, setConflicts] = useState<ConflictSummary[]>([]);
  const [conflictsCount, setConflictsCount] = useState<number>(0);
  const [conflictModal, setConflictModal] = useState<{
    isOpen: boolean;
    loading: boolean;
    detail: ConflictDetail | null;
  }>({ isOpen: false, loading: false, detail: null });
  const [resolvingConflict, setResolvingConflict] = useState(false);

  const normalizeRemoteUrl = (value: string) => value.trim().replace(/\/+$/, '');
  const normalizeRemoteToken = (value: string) => value.trim().replace(/^bearer\s+/i, '');
  const validateRemoteUrl = (value: string) =>
    value.startsWith('http://') || value.startsWith('https://');

  const isPrivateHost = (host: string) => {
    if (host === 'localhost') return true;
    const match = host.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
    if (!match) return false;
    const a = Number(match[1]);
    const b = Number(match[2]);
    if (a === 10 || a === 127) return true;
    if (a === 192 && b === 168) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    return false;
  };

  const makeKey = () => {
    try {
      return crypto.randomUUID();
    } catch {
      return `k_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    }
  };

  useEffect(() => {
    if (!isInTauri()) return;
    let cancelled = false;

    const resolveLocalApi = async () => {
      try {
        const [base, token] = await Promise.all([
          invoke<string | null>('get_local_api_base_url'),
          invoke<string | null>('get_local_api_token'),
        ]);
        if (cancelled) return;
        setLocalBaseUrl(base || '');
        setLocalApiToken(token || '');
      } catch (error) {
        console.error('Failed to resolve local API base/token:', error);
      }
    };

    const onReady = (base: string) => {
      setLocalBaseUrl(base || '');
      resolveLocalApi().catch(console.error);
    };

    resolveLocalApi().catch(console.error);
    eventBus.on('local-api:ready', onReady);
    return () => {
      cancelled = true;
      eventBus.off('local-api:ready', onReady);
    };
  }, []);

  const localApiUrl = (path: string) => {
    if (!localBaseUrl) return path;
    try {
      return new URL(path, localBaseUrl).toString();
    } catch {
      return path;
    }
  };

  const localApiRequest = async <T,>(
    path: string,
    options: { method?: string; body?: any } = {},
  ): Promise<T> => {
    if (!localBaseUrl || !localApiToken) {
      throw new Error(t('sync-local-api-unavailable'));
    }
    const url = localApiUrl(path);
    const method = options.method || 'GET';
    const hasBody = options.body !== undefined;
    const res = await fetch(url, {
      method,
      headers: {
        ...(hasBody ? { 'Content-Type': 'application/json' } : {}),
        Authorization: `Bearer ${localApiToken}`,
      },
      body: hasBody ? JSON.stringify(options.body) : undefined,
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error((data as any)?.error || `${res.status} ${res.statusText}`);
    }
    return data as T;
  };

  const refreshStatus = async () => {
    try {
      const res = await localApiRequest<{ endpoints: SyncStatusEndpoint[] }>('/sync/status');
      setStatusRows(Array.isArray(res.endpoints) ? res.endpoints : []);
    } catch (error) {
      console.error('Failed to load sync status:', error);
    }
  };

  const refreshConflicts = async () => {
    try {
      const res = await localApiRequest<{ unresolved_count: number; conflicts: ConflictSummary[] }>(
        '/sync/conflicts?limit=50&offset=0',
      );
      setConflictsCount(Number(res.unresolved_count || 0));
      setConflicts(Array.isArray(res.conflicts) ? res.conflicts : []);
    } catch (error) {
      console.error('Failed to load sync conflicts:', error);
    }
  };

  useEffect(() => {
    if (!localBaseUrl || !localApiToken) return;
    const loadSettings = async () => {
      try {
        setSaveError('');
        const res = await localApiRequest<any>('/sync/settings');
        const data = res || {};
        setAllowInsecureHttp(!!data.allow_insecure_http);
        setSyncAuto(data.sync_auto !== undefined ? !!data.sync_auto : true);
        setSyncIntervalSecs(
          typeof data.sync_interval_secs === 'number' && data.sync_interval_secs > 0
            ? data.sync_interval_secs
            : 300,
        );

        const remoteEndpoints = Array.isArray(data.remote_endpoints) ? data.remote_endpoints : [];
        const drafts: EndpointDraft[] = remoteEndpoints.map((e: any) => {
          const id = String(e.id || '').trim() || 'default';
          return {
            key: makeKey(),
            id,
            url: normalizeRemoteUrl(String(e.url || '')),
            token: String(e.token || ''),
            originalId: id,
          };
        });
        setEndpoints(drafts);
        setSelectedEndpointKey((prev) => {
          if (prev && drafts.some((d) => d.key === prev)) return prev;
          return drafts[0]?.key || '';
        });
        await Promise.all([refreshStatus(), refreshConflicts()]);
      } catch (error) {
        console.error('Failed to load sync settings:', error);
      }
    };
    loadSettings().catch(console.error);
  }, [localBaseUrl, localApiToken]);

  const saveSettings = async () => {
    setLoading(true);
    setSaveError('');
    try {
      const normalized = endpoints
        .map((e) => ({
          id: String(e.id || '').trim(),
          url: normalizeRemoteUrl(String(e.url || '')),
          token: normalizeRemoteToken(String(e.token || '')),
        }))
        .filter((e) => e.url);

      const ids = normalized.map((e) => e.id);
      const hasEmptyId = ids.some((id) => !id);
      const hasDuplicateId = new Set(ids).size !== ids.length;
      if (hasEmptyId) {
        setSaveError(t('sync-endpoint-id-required'));
        return;
      }
      if (hasDuplicateId) {
        setSaveError(t('sync-endpoint-id-unique'));
        return;
      }
      for (const e of normalized) {
        if (!validateRemoteUrl(e.url)) {
          setSaveError(t('sync-url-invalid'));
          return;
        }
        if (e.url.startsWith('http://') && !allowInsecureHttp) {
          setSaveError(t('sync-http-lan-only'));
          return;
        }
      }

      await localApiRequest('/sync/settings', {
        method: 'PUT',
        body: {
          remote_endpoints: normalized.map((e) => ({
            id: e.id,
            url: e.url,
            token: e.token || undefined,
          })),
          allow_insecure_http: allowInsecureHttp,
          sync_auto: syncAuto,
          sync_interval_secs: syncIntervalSecs,
        },
      });

      // Always local-first (Tauri): the frontend should talk to the local API.
      const base = localBaseUrl || (await invoke<string | null>('get_local_api_base_url')) || '';
      if (base) saveBlinkoEndpoint(base);

      // Update originals so the "ID changed" warning reflects saved state.
      setEndpoints((prev) =>
        prev.map((e) => ({
          ...e,
          originalId: String(e.id || '').trim(),
        })),
      );

      await Promise.all([refreshStatus(), refreshConflicts()]);
    } catch (error) {
      console.error('Failed to save sync settings:', error);
      setSaveError((error as any)?.message || t('operation-failed'));
    } finally {
      setLoading(false);
    }
  };

  const syncNow = async () => {
    setSyncing(true);
    try {
      await invoke('sync_now');
      await Promise.all([refreshStatus(), refreshConflicts()]);
    } catch (error) {
      console.error('Sync failed:', error);
    } finally {
      setSyncing(false);
    }
  };

  const importFromRemote = async (endpoint: EndpointDraft) => {
    setSyncing(true);
    try {
      if (endpoint.url) {
        await invoke('import_remote_to_local_cmd', {
          remoteUrl: normalizeRemoteUrl(endpoint.url),
          token: normalizeRemoteToken(endpoint.token) || null,
        });
        await Promise.all([refreshStatus(), refreshConflicts()]);
      }
    } catch (error) {
      console.error('Import failed:', error);
    } finally {
      setSyncing(false);
    }
  };

  const exportToRemote = async (endpoint: EndpointDraft) => {
    setSyncing(true);
    try {
      if (endpoint.url) {
        await invoke('export_local_to_remote_cmd', {
          remoteUrl: normalizeRemoteUrl(endpoint.url),
          token: normalizeRemoteToken(endpoint.token) || null,
        });
        await Promise.all([refreshStatus(), refreshConflicts()]);
      }
    } catch (error) {
      console.error('Export failed:', error);
    } finally {
      setSyncing(false);
    }
  };

  const testRemoteConnection = async (endpoint: EndpointDraft) => {
    const key = endpoint.key;
    setTestingIds((prev) => ({ ...prev, [key]: true }));
    setTestStatus((prev) => ({ ...prev, [key]: 'idle' }));
    setTestMessage((prev) => ({ ...prev, [key]: '' }));
    const normalizedUrl = normalizeRemoteUrl(endpoint.url);
    const normalizedToken = normalizeRemoteToken(endpoint.token);
    if (!normalizedUrl || !validateRemoteUrl(normalizedUrl)) {
      setTestStatus((prev) => ({ ...prev, [key]: 'error' }));
      setTestMessage((prev) => ({ ...prev, [key]: t('sync-url-invalid') }));
      setTestingIds((prev) => ({ ...prev, [key]: false }));
      return;
    }
    if (normalizedUrl.startsWith('http://') && !allowInsecureHttp) {
      setTestStatus((prev) => ({ ...prev, [key]: 'error' }));
      setTestMessage((prev) => ({ ...prev, [key]: t('sync-http-lan-only') }));
      setTestingIds((prev) => ({ ...prev, [key]: false }));
      return;
    }
    if (!normalizedToken) {
      setTestStatus((prev) => ({ ...prev, [key]: 'error' }));
      setTestMessage((prev) => ({ ...prev, [key]: t('sync-token-required') }));
      setTestingIds((prev) => ({ ...prev, [key]: false }));
      return;
    }
    try {
      await localApiRequest('/sync/test', {
        method: 'POST',
        body: {
          remote_url: normalizedUrl,
          token: normalizedToken,
          allow_insecure_http: allowInsecureHttp,
        },
      });
      setTestStatus((prev) => ({ ...prev, [key]: 'ok' }));
      setTestMessage((prev) => ({
        ...prev,
        [key]: t('sync-test-ok-token'),
      }));
    } catch (error) {
      const fallback = t('sync-test-failed');
      const message = (error as any)?.message || fallback;
      if (
        normalizedUrl.startsWith('https://') &&
        (() => {
          try {
            return isPrivateHost(new URL(normalizedUrl).hostname);
          } catch {
            return false;
          }
        })()
      ) {
        setTestStatus((prev) => ({ ...prev, [key]: 'error' }));
        setTestMessage((prev) => ({ ...prev, [key]: t('sync-test-lan-https-hint') }));
      } else {
        setTestStatus((prev) => ({ ...prev, [key]: 'error' }));
        setTestMessage((prev) => ({ ...prev, [key]: message || fallback }));
      }
    } finally {
      setTestingIds((prev) => ({ ...prev, [key]: false }));
    }
  };

  const addEndpoint = () => {
    const next: EndpointDraft = { key: makeKey(), id: '', url: '', token: '', originalId: '' };
    setEndpoints((prev) => [...prev, next]);
    setSelectedEndpointKey(next.key);
  };

  const removeEndpoint = (key: string) => {
    setEndpoints((prev) => {
      const next = prev.filter((e) => e.key !== key);
      setSelectedEndpointKey((selected) => {
        if (selected !== key) return selected;
        return next[0]?.key || '';
      });
      return next;
    });
  };

  const makePrimary = (key: string) => {
    setEndpoints((prev) => {
      const idx = prev.findIndex((e) => e.key === key);
      if (idx <= 0) return prev;
      const next = [...prev];
      const [item] = next.splice(idx, 1);
      next.unshift(item);
      return next;
    });
  };

  const updateEndpoint = (key: string, patch: Partial<EndpointDraft>) => {
    setEndpoints((prev) => prev.map((e) => (e.key === key ? { ...e, ...patch } : e)));
  };

  const selectedEndpoint = useMemo(
    () => endpoints.find((e) => e.key === selectedEndpointKey) || endpoints[0] || null,
    [endpoints, selectedEndpointKey],
  );

  useEffect(() => {
    props.onSelectedEndpointChange?.(
      selectedEndpoint
        ? { id: selectedEndpoint.id, url: selectedEndpoint.url, token: selectedEndpoint.token }
        : null,
    );
  }, [
    props.onSelectedEndpointChange,
    selectedEndpoint?.id,
    selectedEndpoint?.url,
    selectedEndpoint?.token,
  ]);

  const endpointsMissingToken = useMemo(() => {
    return endpoints.filter((e) => {
      const url = normalizeRemoteUrl(e.url || '');
      if (!url) return false;
      const token = normalizeRemoteToken(e.token || '');
      return !token;
    });
  }, [endpoints]);

  const selectedIndex = useMemo(() => {
    if (!selectedEndpoint) return -1;
    return endpoints.findIndex((e) => e.key === selectedEndpoint.key);
  }, [endpoints, selectedEndpoint]);

  const statusById = useMemo(() => {
    const m = new Map<string, SyncStatusEndpoint>();
    for (const row of statusRows) {
      m.set(row.id, row);
    }
    return m;
  }, [statusRows]);

  const confirmDangerous = (opts: { title: string; content: string; onConfirm: () => Promise<void> }) => {
    showTipsDialog({
      size: 'sm',
      title: opts.title,
      content: opts.content,
      onConfirm: async () => {
        RootStore.Get(DialogStandaloneStore).close();
        await opts.onConfirm();
      },
      onCancel: () => RootStore.Get(DialogStandaloneStore).close(),
    });
  };

  const openConflict = async (id: number) => {
    setConflictModal({ isOpen: true, loading: true, detail: null });
    try {
      const detail = await localApiRequest<ConflictDetail>(`/sync/conflicts/${id}`);
      setConflictModal({ isOpen: true, loading: false, detail });
    } catch (error) {
      console.error('Failed to load conflict detail:', error);
      setConflictModal({ isOpen: true, loading: false, detail: null });
    }
  };

  const closeConflictModal = () => {
    if (resolvingConflict) return;
    setConflictModal({ isOpen: false, loading: false, detail: null });
  };

  const parsePayload = (entityType: string, payload: string | null) => {
    if (!payload) return { title: '', content: '', raw: '' };
    try {
      const obj: any = JSON.parse(payload);
      if (entityType === 'note') {
        return {
          title: String(obj?.title || ''),
          content: String(obj?.content || ''),
          raw: payload,
        };
      }
      if (entityType === 'setting') {
        return {
          title: String(obj?.key || ''),
          content: String(obj?.value || ''),
          raw: payload,
        };
      }
      return { title: '', content: '', raw: payload };
    } catch {
      return { title: '', content: '', raw: payload };
    }
  };

  const resolveConflict = async (choice: 'local' | 'remote') => {
    const detail = conflictModal.detail;
    if (!detail) return;
    setResolvingConflict(true);
    try {
      await localApiRequest(`/sync/conflicts/${detail.id}/resolve`, {
        method: 'POST',
        body: { choice },
      });
      setConflictModal({ isOpen: false, loading: false, detail: null });
      await Promise.all([refreshConflicts(), refreshStatus()]);
    } catch (error) {
      console.error('Failed to resolve conflict:', error);
    } finally {
      setResolvingConflict(false);
    }
  };

  const formatLastSync = (value: string | null) => {
    if (!value) return t('sync-status-never');
    try {
      return new Date(value).toLocaleString();
    } catch {
      return value;
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-lg border border-default-200 p-4">
        <div className="text-sm font-medium">{t('sync-server-settings')}</div>
        <div className="mt-3 flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <Switch isSelected={allowInsecureHttp} onValueChange={setAllowInsecureHttp}>
              {t('sync-allow-http-lan')}
            </Switch>
            <span className="text-xs text-default-500">{t('sync-allow-http-lan-desc')}</span>
          </div>

          <div className="flex flex-col gap-1">
            <Switch isSelected={syncAuto} onValueChange={setSyncAuto}>
              {t('sync-auto-title')}
            </Switch>
            <span className="text-xs text-default-500">{t('sync-auto-desc')}</span>
          </div>

          <div className="max-w-[260px]">
            <Select
              label={t('sync-interval')}
              selectedKeys={[String(syncIntervalSecs)]}
              onSelectionChange={(keys) => {
                const first = Array.from(keys)[0];
                const parsed = Number(first);
                if (!Number.isFinite(parsed) || parsed <= 0) return;
                setSyncIntervalSecs(parsed);
              }}
              isDisabled={!syncAuto}
            >
              {INTERVAL_OPTIONS.map((opt) => (
                <SelectItem key={String(opt.secs)} value={String(opt.secs)}>
                  {t(opt.key)}
                </SelectItem>
              ))}
            </Select>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        <div className="rounded-lg border border-default-200 p-4 lg:col-span-2">
          <div className="flex items-center justify-between gap-2">
            <div className="text-sm font-medium">
              {t('sync-endpoints-title')}
              {conflictsCount > 0 && (
                <span className="ml-2 text-xs text-danger">({conflictsCount} {t('sync-conflicts-title')})</span>
              )}
            </div>
            <Button variant="flat" onPress={addEndpoint}>
              {t('sync-endpoints-add')}
            </Button>
          </div>

          {endpoints.length === 0 ? (
            <div className="mt-3 text-xs text-default-500">{t('sync-endpoints-empty')}</div>
          ) : (
            <div className="mt-3 flex flex-col gap-2">
              {endpoints.map((endpoint, index) => {
                const isPrimary = index === 0;
                const row = statusById.get(endpoint.id);
                const status = row?.status || null;
                const isError = typeof status === 'string' && status.startsWith('error:');
                const isUnauthorized =
                  typeof status === 'string' &&
                  (status.includes('401') || status.toLowerCase().includes('unauthorized'));
                const missingToken =
                  !!normalizeRemoteUrl(endpoint.url || '') &&
                  !normalizeRemoteToken(endpoint.token || '');
                const lastText = formatLastSync(row?.last_sync_at || null);
                const pendingUploads = Number(row?.pending_attachment_uploads_count || 0);
                const outboxPending = Number(row?.outbox_pending_count || 0);
                const lastUploadErr = row?.last_attachment_upload_error || null;
                const isSelected = selectedEndpointKey === endpoint.key;
                return (
                  <div
                    key={endpoint.key}
                    className={`cursor-pointer rounded-md border border-default-200 p-3 transition-colors ${isSelected ? 'bg-default-50' : ''}`}
                    onClick={() => setSelectedEndpointKey(endpoint.key)}
                    role="button"
                    tabIndex={0}
                  >
                    <div className="flex items-center gap-2">
                      <div className="font-medium">{endpoint.id || '-'}</div>
                      <div className="text-xs text-default-500">
                        {isPrimary ? t('sync-endpoint-primary') : t('sync-endpoint-secondary')}
                      </div>
                      <div className="ml-auto text-xs text-default-500">{endpoint.url || '-'}</div>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                      <div>
                        <span className="text-default-500">{t('sync-status-last')}:</span> {lastText}
                      </div>
                      <div className={isError ? 'text-danger' : 'text-default-700'}>
                        <span className="text-default-500">{t('sync-status-state')}:</span> {status || '-'}
                      </div>
                      {missingToken && (
                        <div className="text-warning">
                          <span className="text-default-500">{t('sync-remote-token')}:</span> {t('sync-token-required')}
                        </div>
                      )}
                      {outboxPending > 0 && (
                        <div className="text-default-700">
                          <span className="text-default-500">{t('sync-outbox-pending')}:</span> {outboxPending}
                        </div>
                      )}
                      {pendingUploads > 0 && (
                        <div className="text-warning">
                          <span className="text-default-500">{t('sync-uploads-pending')}:</span> {pendingUploads}
                        </div>
                      )}
                    </div>
                    {isUnauthorized && (
                      <div className="mt-1 text-xs text-warning">{t('sync-unauthorized-hint')}</div>
                    )}
                    {pendingUploads > 0 && lastUploadErr && (
                      <div className="mt-1 text-xs text-danger">{lastUploadErr}</div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="rounded-lg border border-default-200 p-4 lg:col-span-3">
          <div className="text-sm font-medium">{t('sync-endpoints-details')}</div>
          {!selectedEndpoint ? (
            <div className="mt-3 text-xs text-default-500">{t('sync-endpoints-select')}</div>
          ) : (
            <div className="mt-3 flex flex-col gap-3">
              {(() => {
                const url = normalizeRemoteUrl(selectedEndpoint.url || '');
                const token = normalizeRemoteToken(selectedEndpoint.token || '');
                if (!url || token) return null;
                return <div className="text-xs text-warning">{t('sync-token-required')}</div>;
              })()}
              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                <Input
                  label={t('sync-endpoint-id')}
                  value={selectedEndpoint.id}
                  onChange={(e) => updateEndpoint(selectedEndpoint.key, { id: e.target.value })}
                />
                <Input
                  className="md:col-span-2"
                  label={t('sync-remote-base-url')}
                  placeholder={t('sync-remote-base-url-placeholder')}
                  value={selectedEndpoint.url}
                  onChange={(e) => updateEndpoint(selectedEndpoint.key, { url: e.target.value })}
                />
              </div>

              {selectedEndpoint.originalId &&
                selectedEndpoint.id &&
                selectedEndpoint.originalId !== selectedEndpoint.id && (
                  <div className="text-xs text-warning">{t('sync-endpoint-id-warning')}</div>
                )}

              <Input
                label={t('sync-remote-token')}
                placeholder={t('sync-remote-token-placeholder')}
                type="password"
                value={selectedEndpoint.token}
                onChange={(e) => updateEndpoint(selectedEndpoint.key, { token: e.target.value })}
              />

              <div className="flex flex-wrap items-center gap-2">
                {selectedIndex > 0 && (
                  <Button size="sm" variant="flat" onPress={() => makePrimary(selectedEndpoint.key)}>
                    {t('sync-endpoint-make-primary')}
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="flat"
                  isLoading={!!testingIds[selectedEndpoint.key]}
                  isDisabled={
                    !normalizeRemoteUrl(selectedEndpoint.url || '') ||
                    !normalizeRemoteToken(selectedEndpoint.token || '')
                  }
                  onPress={() => testRemoteConnection(selectedEndpoint)}
                >
                  {t('sync-test-connection')}
                </Button>
                <Button
                  size="sm"
                  variant="flat"
                  onPress={() => {
                    const current = window.localStorage.getItem('token') || '';
                    if (!current) {
                      setSaveError(t('sync-no-session-token'));
                      return;
                    }
                    updateEndpoint(selectedEndpoint.key, { token: normalizeRemoteToken(current) });
                    setSaveError('');
                  }}
                >
                  {t('sync-use-current-token')}
                </Button>
                <Button size="sm" color="danger" variant="flat" onPress={() => removeEndpoint(selectedEndpoint.key)}>
                  {t('delete')}
                </Button>
              </div>

              {(() => {
                const currentTestStatus = testStatus[selectedEndpoint.key] || 'idle';
                const currentMessage = testMessage[selectedEndpoint.key] || '';
                if (currentTestStatus === 'idle' || !currentMessage) return null;
                return (
                  <div className={currentTestStatus === 'ok' ? 'text-success text-sm' : 'text-danger text-sm'}>
                    {currentMessage}
                  </div>
                );
              })()}

              <div className="mt-2 rounded-md border border-default-200 p-3">
                <div className="text-sm font-medium">{t('sync-actions-advanced')}</div>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="flat"
                    isLoading={syncing}
                    isDisabled={
                      !normalizeRemoteUrl(selectedEndpoint.url || '') ||
                      !normalizeRemoteToken(selectedEndpoint.token || '')
                    }
                    onPress={() => {
                      confirmDangerous({
                        title: t('sync-import-confirm-title'),
                        content: t('sync-import-confirm-body'),
                        onConfirm: async () => importFromRemote(selectedEndpoint),
                      });
                    }}
                  >
                    {t('sync-import')}
                  </Button>
                  <Button
                    size="sm"
                    variant="flat"
                    isLoading={syncing}
                    isDisabled={
                      !normalizeRemoteUrl(selectedEndpoint.url || '') ||
                      !normalizeRemoteToken(selectedEndpoint.token || '')
                    }
                    onPress={() => {
                      confirmDangerous({
                        title: t('sync-export-confirm-title'),
                        content: t('sync-export-confirm-body'),
                        onConfirm: async () => exportToRemote(selectedEndpoint),
                      });
                    }}
                  >
                    {t('sync-export')}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="rounded-lg border border-default-200 p-4">
        <div className="text-sm font-medium">{t('sync-actions')}</div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button color="primary" isLoading={loading} onPress={saveSettings}>
            {t('save')}
          </Button>
          <Button
            variant="flat"
            isLoading={syncing}
            isDisabled={endpoints.length === 0 || endpointsMissingToken.length > 0}
            onPress={syncNow}
          >
            {t('sync-now')}
          </Button>
        </div>
        {saveError && <div className="mt-2 text-sm text-danger">{saveError}</div>}
        {endpointsMissingToken.length > 0 && (
          <div className="mt-2 text-xs text-warning">
            {t('sync-token-missing-blocked')}{' '}
            {endpointsMissingToken
              .map((e) => String(e.id || '').trim())
              .filter(Boolean)
              .join(', ')}
          </div>
        )}
        <div className="mt-2 text-xs text-default-500">{t('sync-actions-hint')}</div>
      </div>

      <div className="rounded-lg border border-default-200 p-4">
        <div className="flex items-center justify-between gap-2">
          <div className="text-sm font-medium">
            {t('sync-conflicts-title')} {conflictsCount > 0 ? `(${conflictsCount})` : ''}
          </div>
          <Button variant="flat" size="sm" onPress={refreshConflicts}>
            {t('refresh')}
          </Button>
        </div>

        {conflicts.length === 0 ? (
          <div className="mt-3 text-xs text-default-500">{t('sync-conflicts-empty')}</div>
        ) : (
          <div className="mt-3 flex flex-col gap-2">
            {conflicts.map((c) => (
              <div key={c.id} className="flex flex-col rounded-md border border-default-200 p-3">
                <div className="flex items-center gap-2">
                  <div className="font-medium">{c.entity_type}</div>
                  <div className="text-xs text-default-500">{c.entity_id}</div>
                  <div className="ml-auto text-xs text-default-500">
                    {(() => {
                      try {
                        return new Date(c.created_at).toLocaleString();
                      } catch {
                        return c.created_at;
                      }
                    })()}
                  </div>
                </div>
                <div className="mt-2">
                  <Button size="sm" variant="flat" onPress={() => openConflict(c.id)}>
                    {t('sync-conflicts-open')}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <Modal isOpen={conflictModal.isOpen} onClose={closeConflictModal} placement="center" size="5xl">
        <ModalContent className="rounded-lg">
          <ModalHeader className="flex items-center gap-2">
            {t('sync-conflicts-title')}
          </ModalHeader>
          <ModalBody className="py-4">
            {conflictModal.loading || !conflictModal.detail ? (
              <div className="text-sm text-default-500">{t('loading')}</div>
            ) : (
              (() => {
                const detail = conflictModal.detail!;
                const local = parsePayload(detail.entity_type, detail.local_payload);
                const remote = parsePayload(detail.entity_type, detail.remote_payload);
                return (
                  <div className="flex flex-col gap-3">
                    <div className="text-xs text-default-500">
                      {detail.entity_type} · {detail.entity_id}
                    </div>

                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                      <div className="rounded-md border border-default-200 p-3">
                        <div className="text-sm font-medium">{t('sync-conflict-local')}</div>
                        {detail.entity_type === 'note' ? (
                          <div className="mt-2 flex flex-col gap-2">
                            <div className="font-medium">{local.title || '-'}</div>
                            {local.content ? (
                              <MarkdownRender content={local.content} />
                            ) : (
                              <pre className="text-xs whitespace-pre-wrap break-words">{local.raw}</pre>
                            )}
                          </div>
                        ) : (
                          <pre className="mt-2 text-xs whitespace-pre-wrap break-words">{detail.local_payload}</pre>
                        )}
                      </div>

                      <div className="rounded-md border border-default-200 p-3">
                        <div className="text-sm font-medium">{t('sync-conflict-remote')}</div>
                        {detail.entity_type === 'note' ? (
                          <div className="mt-2 flex flex-col gap-2">
                            <div className="font-medium">{remote.title || '-'}</div>
                            {remote.content ? (
                              <MarkdownRender content={remote.content} />
                            ) : (
                              <pre className="text-xs whitespace-pre-wrap break-words">{remote.raw}</pre>
                            )}
                          </div>
                        ) : (
                          <pre className="mt-2 text-xs whitespace-pre-wrap break-words">{detail.remote_payload}</pre>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })()
            )}
          </ModalBody>
          <ModalFooter>
            <Button variant="flat" isDisabled={resolvingConflict} onPress={closeConflictModal}>
              {t('cancel')}
            </Button>
            <Button
              color="primary"
              isLoading={resolvingConflict}
              isDisabled={!conflictModal.detail}
              onPress={() => resolveConflict('local')}
            >
              {t('sync-conflict-keep-local')}
            </Button>
            <Button
              color="danger"
              variant="flat"
              isLoading={resolvingConflict}
              isDisabled={!conflictModal.detail}
              onPress={() => resolveConflict('remote')}
            >
              {t('sync-conflict-keep-remote')}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </div>
  );
});
