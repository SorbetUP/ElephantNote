import { observer } from 'mobx-react-lite';
import { Button } from '@heroui/react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { CollapsibleCard } from '@/components/Common/CollapsibleCard';
import { Icon } from '@/components/Common/Iconify/icons';

export const TrashSetting = observer(() => {
  const { t } = useTranslation();
  const nav = useNavigate();

  return (
    <CollapsibleCard icon="hugeicons:delete-02" title={t('trash')} decorations={false}>
      <div className="space-y-3">
        <div className="text-sm text-default-600">
          {t('trash-setting-desc', "Open the recycle bin to restore or permanently delete items.")}
        </div>

        <div className="flex gap-2">
          <Button
            color="primary"
            startContent={<Icon icon="hugeicons:arrow-right-02" width="18" height="18" />}
            onPress={() => nav('/?path=trash')}
          >
            {t('open-trash', 'Open recycle bin')}
          </Button>
        </div>
      </div>
    </CollapsibleCard>
  );
});

