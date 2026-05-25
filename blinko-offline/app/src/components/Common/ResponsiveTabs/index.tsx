import { observer } from 'mobx-react-lite';
import { ScrollArea } from '@/components/Common/ScrollArea';
import { ScrollableTabs, TabItem } from '@/components/Common/ScrollableTabs';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { Icon } from '@/components/Common/Iconify/icons';
import { useTranslation } from 'react-i18next';
import { ReactNode } from 'react';
import { Avatar } from '@heroui/react';

interface ResponsiveTabsProps {
  items: TabItem[];
  selectedKey: string;
  onSelectionChange: (key: string) => void;
  color?: 'primary' | 'secondary' | 'default' | 'success' | 'warning' | 'danger';
  classNames?: {
    base?: string;
    tabList?: string;
    tab?: string;
    cursor?: string;
  };
  sidebarClassName?: string;
  sidebarMaxHeight?: string;
  mobileStickyTop?: boolean;
  children?: ReactNode;
}

export const ResponsiveTabs = observer(({
  items,
  selectedKey,
  onSelectionChange,
  color = 'primary',
  classNames = {},
  sidebarClassName = '',
  sidebarMaxHeight = 'calc(100vh-140px)',
  mobileStickyTop = false,
  children
}: ResponsiveTabsProps) => {
  const { t } = useTranslation();
  const isMobile = useMediaQuery('(max-width: 768px)');

  if (isMobile) {
    return (
      <div className="w-full">
        <div className={`w-full ${mobileStickyTop ? 'sticky top-0 z-10' : ''}`}>
          <div className={`mx-1 ${mobileStickyTop ? 'backdrop-blur-md bg-background rounded-2xl' : ''}`}>
            <ScrollableTabs 
              items={items} 
              selectedKey={selectedKey} 
              onSelectionChange={onSelectionChange} 
              color={color}
              classNames={classNames}
            />
          </div>
        </div>
        {children}
      </div>
    );
  }

  return (
    <div className="w-full flex flex-row h-full">
      <div className={`w-56 mr-6 ${sidebarClassName}`}>
        <div className="rounded-xl bg-background p-1 mb-4">
          <ScrollArea onBottom={() => {}} className={`h-auto`} style={{ maxHeight: sidebarMaxHeight }}>
            <div className="p-1 flex flex-col flex-nowrap gap-1">
              {items.map((item) => (
                <button
                  key={item.key}
                  onClick={() => onSelectionChange(item.key)}
                  className={`cursor-pointer flex items-center px-3 py-2 rounded-lg text-sm transition-colors ${
                    selectedKey === item.key
                      ? 'bg-primary text-primary-foreground font-medium'
                      : 'hover:bg-muted/50 text-foreground/80 hover:text-foreground'
                  }`}
                >
                  {item.avatar ? (
                    <span className="flex-shrink-0 mr-2">
                      <Avatar src={item.avatar} size="sm" className="w-[18px] h-[18px]" />
                    </span>
                  ) : item.icon ? (
                    <span className="flex-shrink-0 mr-2">
                      <Icon icon={item.icon} width="18" />
                    </span>
                  ) : null}
                  <span className="font-bold">
                    {typeof item.title === 'string' ? t(item.title) : item.title}
                  </span>
                </button>
              ))}
            </div>
          </ScrollArea>
        </div>
      </div>
      
      <div className="flex-1 overflow-hidden">
        {children}
      </div>
    </div>
  );
}); 