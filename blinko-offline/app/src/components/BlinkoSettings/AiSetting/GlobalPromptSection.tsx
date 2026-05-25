import { observer } from 'mobx-react-lite';
import { Textarea } from '@heroui/react';
import { CollapsibleCard } from '../../Common/CollapsibleCard';
import { useTranslation } from 'react-i18next';
import { useEffect, useState } from 'react';
import { RootStore } from '@/store';
import { BlinkoStore } from '@/store/blinkoStore';
import { PromiseCall } from '@/store/standard/PromiseState';
import { api } from '@/lib/trpc';

export const GlobalPromptSection = observer(() => {
  const { t } = useTranslation();
  const blinko = RootStore.Get(BlinkoStore);
  const [globalPrompt, setGlobalPrompt] = useState('');

  useEffect(() => {
    blinko.config.call();
  }, []);

  useEffect(() => {
    setGlobalPrompt(blinko.config.value?.globalPrompt || '');
  }, [blinko.config.value?.globalPrompt]);

  const handlePromptChange = (value: string) => {
    setGlobalPrompt(value);
  };

  const handlePromptBlur = () => {
    PromiseCall(
      api.config.update.mutate({
        key: 'globalPrompt',
        value: globalPrompt,
      }),
      { autoAlert: false }
    );
  };

  return (
    <CollapsibleCard icon="hugeicons:message-01" title="Global Prompt Configuration" decorations={false}>
      <div className="space-y-4">
        <div className="flex flex-col gap-2">
          <div className="font-medium">{t('global-prompt')}</div>
        </div>

        <Textarea
          radius="lg"
          minRows={4}
          maxRows={8}
          value={globalPrompt}
          onChange={(e) => handlePromptChange(e.target.value)}
          onBlur={handlePromptBlur}
          placeholder={`You are a versatile AI assistant who can:
1. Answer questions and explain concepts
2. Provide suggestions and analysis
3. Help with planning and organizing ideas

Always respond in the user's language.
Maintain a friendly and professional conversational tone.`}
          className="w-full"
        />
      </div>
    </CollapsibleCard>
  );
});
