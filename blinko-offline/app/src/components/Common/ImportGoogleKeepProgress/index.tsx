import { streamApi, api } from '@/lib/trpc'
import { type ProgressResult } from '@shared/lib/types'
import { RootStore } from '@/store'
import { BlinkoStore } from '@/store/blinkoStore'
import { DialogStore } from '@/store/module/Dialog'
import { Button, Progress, Switch } from '@heroui/react'
import { observer } from 'mobx-react-lite'
import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { isLocalMode } from '@/lib/blinkoEndpoint'

type GoogleKeepImportOptions = {
  autoTags: boolean;
  importTextHashtags: boolean;
};

export const ImportGoogleKeepProgress = observer(({ filePath, options }: { filePath: string; options: GoogleKeepImportOptions }) => {
  const { t } = useTranslation()
  const blinko = RootStore.Get(BlinkoStore)
  const store = RootStore.Local(() => ({
    progress: 0,
    total: 0,
    message: [] as ProgressResult[],
    status: '',
    get value() {
      const v = Math.round((store.progress / store.total) * 100)
      return isNaN(v) ? 0 : v
    },
    handleAsyncGenerator: async () => {
      try {
        if (isLocalMode()) {
          // Local mode: call regular API (non-streaming)
          const results = await api.task.importFromGoogleKeep.mutate({
            filePath,
            autoTags: options.autoTags,
            importTextHashtags: options.importTextHashtags,
          }) as ProgressResult[]

          // Process batch results
          store.total = results.length
          for (let i = 0; i < results.length; i++) {
            const item = results[i]
            store.progress = i + 1
            store.message.unshift(item)
            store.status = item.type === 'success' ? 'success' : 'error'
          }
        } else {
          // Web mode: use streaming API
          const asyncGeneratorRes = await streamApi.task.importFromGoogleKeep.mutate({
            filePath,
            autoTags: options.autoTags,
            importTextHashtags: options.importTextHashtags,
          })
          for await (const item of asyncGeneratorRes) {
            store.progress = item.progress?.current ?? 0
            store.total = item.progress?.total ?? 0
            store.message.unshift(item)
            store.status = item.type === 'success' ? 'success' : 'error'
          }
        }

        // Common: show "import done"
        store.message.unshift({
          type: 'success',
          content: t('import-done'),
        })
        blinko.updateTicker++
      } catch (error) {
        console.error('Import failed:', error)
        store.message.unshift({
          type: 'error',
          content: error instanceof Error ? error.message : 'Import failed',
        })
        store.status = 'error'
      }
    }
  }))

  useEffect(() => {
    store.handleAsyncGenerator()
  }, [])

  return (
    <div>
      <Progress
        size="sm"
        radius="sm"
        color="warning"
        label="Progress"
        value={store.value}
        showValueLabel={true}
      />
      <div className='flex flex-col max-h-[400px] overflow-y-auto mt-2'>
        {store.message.map((item, index) => (
          <div className='flex gap-2' key={index}>
            <div className={`${item.type === 'success' ? 'text-green-500' : item.type === 'error' ? 'text-red-500' : ''}`}>
              {item.type == 'skip' ? '🔄' : item.type == 'success' ? '✅' : '❌'}
            </div>
            <div className={`truncate text-gray-500`}>{item?.content}</div>
          </div>
        ))}
      </div>
    </div>
  )
})

const GoogleKeepImportOptionsDialog = observer(({ filePath }: { filePath: string }) => {
  const { t } = useTranslation()
  const store = RootStore.Local(() => ({
    autoTags: true,
    importTextHashtags: false,
  }))

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start gap-3">
        <Switch
          size="sm"
          isSelected={store.autoTags}
          onValueChange={(value) => { store.autoTags = value }}
        />
        <div className="flex flex-col gap-1">
          <div className="text-sm font-medium">{t('google-keep-auto-tags')}</div>
          <div className="text-xs text-desc">{t('google-keep-auto-tags-desc')}</div>
        </div>
      </div>
      <div className="flex items-start gap-3">
        <Switch
          size="sm"
          isSelected={store.importTextHashtags}
          onValueChange={(value) => { store.importTextHashtags = value }}
        />
        <div className="flex flex-col gap-1">
          <div className="text-sm font-medium">{t('google-keep-import-text-hashtags')}</div>
          <div className="text-xs text-desc">{t('google-keep-import-text-hashtags-desc')}</div>
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="light" onPress={() => RootStore.Get(DialogStore).close()}>
          {t('cancel')}
        </Button>
        <Button
          size="sm"
          color="primary"
          onPress={() => {
            RootStore.Get(DialogStore).close()
            ShowGoogleKeepProgressDialog(filePath, { autoTags: store.autoTags, importTextHashtags: store.importTextHashtags })
          }}
        >
          {t('import')}
        </Button>
      </div>
    </div>
  )
})

export const ShowGoogleKeepProgressDialog = async (filePath: string, options: GoogleKeepImportOptions) => {
  RootStore.Get(DialogStore).setData({
    title: 'Google Keep Import Progress',
    content: <ImportGoogleKeepProgress filePath={filePath} options={options} />,
    isOpen: true,
    size: 'lg',
  })
}

export const ShowGoogleKeepOptionsDialog = async (filePath: string) => {
  RootStore.Get(DialogStore).setData({
    title: 'Google Keep Import',
    content: <GoogleKeepImportOptionsDialog filePath={filePath} />,
    isOpen: true,
    size: 'md',
  })
}
