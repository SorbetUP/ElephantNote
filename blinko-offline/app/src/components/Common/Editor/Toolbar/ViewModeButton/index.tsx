import { IconButton } from '../IconButton';
import { useTranslation } from 'react-i18next';
import { eventBus } from '@/lib/event';
import { useMediaQuery } from 'usehooks-ts';
import { Dropdown, DropdownTrigger, DropdownMenu, DropdownItem } from '@heroui/react';

interface Props {
  viewMode: "wysiwyg" | "sv" | "ir" | "raw";
}

export const ViewModeButton = ({ viewMode }: Props) => {
  const { t } = useTranslation();
  const isPc = useMediaQuery('(min-width: 768px)');
  const modes = [
    {
      key: 'ir',
      label: t('live-preview'),
      icon: 'tabler:eye',
    },
    {
      key: 'sv',
      label: t('split-view'),
      icon: 'tabler:layout-columns',
    },
    {
      key: 'raw',
      label: t('raw-markdown'),
      icon: 'tabler:code',
    },
    ...(isPc ? [{
      key: 'wysiwyg',
      label: t('rich-text'),
      icon: 'tabler:eye-edit',
    }] : [])
  ];

  const getCurrentMode = () => {
    return modes.find(mode => mode.key === viewMode) || modes[0];
  };

  const handleModeChange = (key: string) => {
    eventBus.emit('editor:setViewMode', key);
  };

  return (
    <Dropdown>
      <DropdownTrigger>
        <div className="hover:bg-default-100 rounded-md">
          <IconButton
            tooltip="View Mode"
            icon={getCurrentMode().icon}
          />
        </div>
      </DropdownTrigger>
      <DropdownMenu
        aria-label="Editor view mode"
        selectedKeys={[viewMode]}
        selectionMode="single"
        onSelectionChange={(keys) => {
          const selectedKey = Array.from(keys)[0] as string;
          if (selectedKey && selectedKey !== viewMode) {
            handleModeChange(selectedKey);
          }
        }}
      >
        {modes.map((mode) => (
          <DropdownItem
            key={mode.key}
            startContent={
              <div className="flex items-center">
                <i className={`${mode.icon} text-lg`} />
              </div>
            }
          >
            {mode.label}
          </DropdownItem>
        ))}
      </DropdownMenu>
    </Dropdown>
  );
}; 