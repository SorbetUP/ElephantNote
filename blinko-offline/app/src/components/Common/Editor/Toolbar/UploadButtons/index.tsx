import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { IconButton } from '../IconButton';
import { ShowAudioDialog } from '../../../AudioDialog';
import { BlinkoStore } from '@/store/blinkoStore';
import { RootStore } from '@/store';
import { DropzoneInputProps } from 'react-dropzone';
import { eventBus } from '@/lib/event';

interface UploadAction {
  key: string;
  icon: string;
  title: string;
  onClick: () => void;
  showCondition?: boolean;
}

interface Props {
  getInputProps: () => DropzoneInputProps;
  open: () => void;
  onFileUpload: (files: File[]) => void;
}

export const UploadButtons = ({ getInputProps, open, onFileUpload }: Props) => {
  const { t } = useTranslation();
  const blinko = RootStore.Get(BlinkoStore);

  // Listen for audio recording event from Android shortcuts
  useEffect(() => {
    const handleStartAudioRecording = () => {
      ShowAudioDialog((file) => onFileUpload([file]));
    };
    
    eventBus.on('editor:startAudioRecording', handleStartAudioRecording);
    
    return () => {
      eventBus.off('editor:startAudioRecording', handleStartAudioRecording);
    };
  }, [onFileUpload]);

  const uploadActions: UploadAction[] = [
    {
      key: 'file',
      icon: 'mage:file-upload',
      title: t('upload-file'),
      onClick: open,
    },
    {
      key: 'audio',
      icon: "hugeicons:voice-id",
      title: t('recording'),
      onClick: () => ShowAudioDialog((file) => onFileUpload([file])),
      showCondition: blinko.showAi,
    },
    // {
    //   key: 'camera',
    //   icon: 'hugeicons:camera-lens',
    //   title: t('camera'),
    //   onClick: () => ShowCamera((file) => onFileUpload([file])),
    // },
  ];

  return (
    <>
      {uploadActions
        .filter(action => action.showCondition !== false)
        .map(action => (
          <IconButton
            key={action.key}
            icon={action.icon}
            tooltip={action.title}
            onClick={action.onClick}
          >
            {action.key === 'file' && <input {...getInputProps()} />}
          </IconButton>
        ))}
    </>
  );
}; 