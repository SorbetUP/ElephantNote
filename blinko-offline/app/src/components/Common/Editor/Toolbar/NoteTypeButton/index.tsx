import { IconButton } from '../IconButton';
import { useTranslation } from 'react-i18next';
import { NoteType } from '@shared/lib/types';
import { Div } from '@/components/Common/Div';
import { useEffect, useState } from 'react';

export const NoteTypeButton = ({ noteType, setNoteType}: {
  noteType: NoteType,
  setNoteType: (noteType: NoteType) => void
}) => {
  const { t } = useTranslation();
  const [type, setType] = useState(noteType);

  useEffect(() => {
    setType(noteType);
  }, [noteType]);
  
  const getNextNoteType = (currentType: NoteType) => {
    switch (currentType) {
      case NoteType.BLINKO:
        return NoteType.NOTE;
      case NoteType.NOTE:
        return NoteType.TODO;
      case NoteType.TODO:
        return NoteType.BLINKO;
      default:
        return NoteType.BLINKO;
    }
  };

  const getIconForType = (noteType: NoteType) => {
    switch (noteType) {
      case NoteType.BLINKO:
        return 'basil:lightning-solid';
      case NoteType.NOTE:
        return 'solar:notes-minimalistic-bold-duotone';
      case NoteType.TODO:
        return 'solar:folder-check-bold';
      default:
        return 'basil:lightning-solid';
    }
  };

  const getColorForType = (noteType: NoteType) => {
    switch (noteType) {
      case NoteType.BLINKO:
        return '!text-[#FFD700]';
      case NoteType.NOTE:
        return '!text-[#3B82F6]';
      case NoteType.TODO:
        return '!text-[#10B981]';
      default:
        return '!text-[#FFD700]';
    }
  };

  const getLabelForType = (noteType: NoteType) => {
    switch (noteType) {
      case NoteType.BLINKO:
        return t('blinko');
      case NoteType.NOTE:
        return t('note');
      case NoteType.TODO:
        return t('todo');
      default:
        return t('blinko');
    }
  };
  
  return (
    <Div
      className='mr-[-2px]'
      onTap={() => {
        const newType = getNextNoteType(type);
        setType(newType);
        setNoteType(newType);
      }}>
      <IconButton
        icon={getIconForType(type)}
        classNames={{
          icon: getColorForType(type)
        }}
        tooltip={getLabelForType(type)}
      />
    </Div>
  );
}; 