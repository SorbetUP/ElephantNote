import { Tabs, Tab } from '@heroui/react';
import { observer } from 'mobx-react-lite';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { isInTauri } from '@/lib/tauriHelper';
import { useMediaQuery } from '@/hooks/useMediaQuery';

import { SyncSetting } from './SyncSetting';
import { ServerSyncPanel } from './ServerSyncSetting';
import { BackupSetting } from './BackupSetting';

type SelectedEndpoint = {
  id: string;
  url: string;
  token: string;
} | null;

const normalizeRemoteUrl = (value: string) => value.trim().replace(/\/+$/, '');
const normalizeRemoteToken = (value: string) => value.trim().replace(/^bearer\s+/i, '');

export const UnifiedSyncSetting = observer(() => {
  const { t } = useTranslation();
  const isMobile = useMediaQuery('(max-width: 768px)');
  const [selectedEndpoint, setSelectedEndpoint] = useState<SelectedEndpoint>(null);

  const selectedUrl = useMemo(
    () => normalizeRemoteUrl(selectedEndpoint?.url || ''),
    [selectedEndpoint?.url],
  );
  const selectedToken = useMemo(
    () => normalizeRemoteToken(selectedEndpoint?.token || ''),
    [selectedEndpoint?.token],
  );

  const tauriRemote = useMemo(() => {
    if (!selectedUrl || !selectedToken) return null;
    return { url: selectedUrl, token: selectedToken };
  }, [selectedUrl, selectedToken]);

  // Web: only the server replication section makes sense.
  if (!isInTauri()) {
    return <ServerSyncPanel />;
  }

  const serverDisabledReason = !selectedUrl
    ? t('sync-endpoints-empty')
    : !selectedToken
      ? t('sync-token-required')
      : '';

  const device = (
    <SyncSetting
      onSelectedEndpointChange={(next) => setSelectedEndpoint(next)}
    />
  );

  const server = (
    <ServerSyncPanel
      apiBaseUrl={tauriRemote?.url}
      bearerToken={tauriRemote?.token}
      disabledReason={serverDisabledReason || undefined}
    />
  );

  const save = <BackupSetting />;

  if (isMobile) {
    return (
      <Tabs aria-label="Sync tabs">
        <Tab key="device" title={t('settings-sync-device')}>
          {device}
        </Tab>
        <Tab key="server" title={t('settings-sync-server')}>
          {server}
        </Tab>
        <Tab key="save" title={t('settings-sync-save')}>
          {save}
        </Tab>
      </Tabs>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="text-sm font-medium">{t('settings-sync-device')}</div>
        <div className="mt-3">{device}</div>
      </div>
      <div>
        <div className="text-sm font-medium">{t('settings-sync-server')}</div>
        <div className="mt-3">{server}</div>
      </div>
      <div>
        <div className="text-sm font-medium">{t('settings-sync-save')}</div>
        <div className="mt-3">{save}</div>
      </div>
    </div>
  );
});
