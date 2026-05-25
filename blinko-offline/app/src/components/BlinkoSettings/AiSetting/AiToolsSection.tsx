import { observer } from 'mobx-react-lite';
import { Input, Slider } from '@heroui/react';
import { CollapsibleCard } from '../../Common/CollapsibleCard';
import { useTranslation } from 'react-i18next';
import { useEffect, useState } from 'react';
import { RootStore } from '@/store';
import { BlinkoStore } from '@/store/blinkoStore';
import { PromiseCall } from '@/store/standard/PromiseState';
import { api } from '@/lib/trpc';
import { Item } from '../Item';
import { useMediaQuery } from 'usehooks-ts';

export const AiToolsSection = observer(() => {
  const { t } = useTranslation();
  const blinko = RootStore.Get(BlinkoStore);
  const isPc = useMediaQuery('(min-width: 768px)');

  const [tavilyApiKey, setTavilyApiKey] = useState('');
  const [tavilyMaxResult, setTavilyMaxResult] = useState(5);

  useEffect(() => {
    blinko.config.call();
  }, []);

  useEffect(() => {
    if (blinko.config.value) {
      setTavilyApiKey(blinko.config.value.tavilyApiKey || '');
      setTavilyMaxResult(Number(blinko.config.value.tavilyMaxResult) || 5);
    }
  }, [blinko.config.value]);

  const updateConfig = (key: string, value: any) => {
    PromiseCall(
      api.config.update.mutate({ key, value }),
      { autoAlert: false }
    ).then(() => {
      blinko.config.call();
    });
  };

  return (
    <CollapsibleCard icon="hugeicons:ai-chemistry-02" title={t('ai-tools')} decorations={false}>
      <Item
        leftContent={<>{t('tavily-api-key')}</>}
        rightContent={
          <Input
            size="sm"
            label="API key"
            variant="bordered"
            className="w-full md:w-[300px]"
            value={tavilyApiKey}
            onChange={(e) => {
              setTavilyApiKey(e.target.value);
            }}
            onBlur={(e) => {
              updateConfig('tavilyApiKey', e.target.value);
            }}
          />
        }
      />

      <Item
        type={isPc ? 'row' : 'col'}
        leftContent={
          <div className="flex flex-col gap-1">
            <>{t('tavily-max-results')}</>
            <div className="text-[12px] text-default-400">{t('maximum-search-results-to-return')}</div>
          </div>
        }
        rightContent={
          <div className="flex md:w-[300px] w-full ml-auto justify-start">
            <Slider
              onChangeEnd={(value) => {
                updateConfig('tavilyMaxResult', Number(value));
              }}
              onChange={(value) => {
                setTavilyMaxResult(Number(value));
              }}
              value={tavilyMaxResult}
              size="md"
              step={1}
              color="foreground"
              label={'value'}
              showSteps={false}
              maxValue={20}
              minValue={1}
              defaultValue={5}
              className="w-full"
            />
          </div>
        }
      />
    </CollapsibleCard>
  );
});
