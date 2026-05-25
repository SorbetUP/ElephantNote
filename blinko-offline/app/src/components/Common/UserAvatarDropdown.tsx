import { Icon } from '@/components/Common/Iconify/icons';
import { Image } from '@heroui/react';
import { observer } from 'mobx-react-lite';
import { RootStore } from '@/store';
import { UserStore } from '@/store/user';
import { useNavigate } from 'react-router-dom';
import { getBlinkoEndpoint } from '@/lib/blinkoEndpoint';

interface UserAvatarDropdownProps {
  onItemClick?: () => void;
  collapsed?: boolean;
  showOverlay?: boolean;
}

export const UserAvatarDropdown = observer(({ onItemClick, collapsed = false, showOverlay = false }: UserAvatarDropdownProps) => {
  const user = RootStore.Get(UserStore);
  const nav = useNavigate()
  return (
    <div
      className={`cursor-pointer ${collapsed ? 'flex justify-center' : 'flex items-center gap-2'}`}
      onClick={() => {
        nav('/settings');
        onItemClick?.();
      }}
    >
      <div className="relative group">
        {user.image ? (
          <img
            src={getBlinkoEndpoint(`${user.image}?token=${user.tokenData.value?.token}`)}
            alt="avatar"
            className={`${collapsed ? 'w-10 h-10' : 'w-8 h-8'} rounded-full object-cover transition-all`}
          />
        ) : (
          <Image src="/logo.png" width={30} />
        )}
        <div
          className={`absolute inset-0 bg-black/30 rounded-full flex items-center justify-center transition-opacity ${showOverlay ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
            }`}
        >
          <Icon icon="mdi:cog" width="16" height="16" className="text-white" />
        </div>
      </div>
      {!collapsed && <span className="font-bold">{user.nickname || user.name}</span>}
    </div>
  );
});
