import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';

vi.mock('@/lib/i18n', () => ({ default: { t: (k: string) => k } }));

const stubs = vi.hoisted(() => ({
  showEdit: vi.fn(),
  focusFix: vi.fn(),
  emit: vi.fn(),
  toastError: vi.fn(),
  readFile: vi.fn(async () => new Uint8Array([1, 2, 3])),
}));

vi.mock('@/lib/tauriHelper', () => ({
  isAndroid: () => true,
  isInTauri: () => true,
}));

vi.mock('@/components/BlinkoRightClickMenu', () => ({
  ShowEditBlinkoModel: (...args: any[]) => stubs.showEdit(...args),
}));

vi.mock('@/components/Common/Editor/editorUtils', () => ({
  FocusEditorFixMobile: () => stubs.focusFix(),
}));

vi.mock('@/lib/event', () => ({
  eventBus: {
    emit: (...args: any[]) => stubs.emit(...args),
  },
}));

vi.mock('@tauri-apps/plugin-fs', () => ({
  readFile: (...args: any[]) => stubs.readFile(...args),
}));

vi.mock('@/store', () => ({
  RootStore: {
    Get: (cls: any) => {
      if (cls?.name === 'ToastPlugin') {
        return { error: (msg: string) => stubs.toastError(msg) };
      }
      return {};
    },
  },
}));

import { useAndroidShortcuts } from '@/lib/hooks';

function Harness() {
  useAndroidShortcuts();
  return null;
}

describe('useAndroidShortcuts', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    stubs.showEdit.mockReset();
    stubs.focusFix.mockReset();
    stubs.emit.mockReset();
    stubs.toastError.mockReset();
    stubs.readFile.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('handles Android shortcut: quick note', () => {
    localStorage.setItem('android_shortcut_action', 'quick_note');
    const { unmount } = render(<Harness />);

    expect(stubs.showEdit).toHaveBeenCalledWith('2xl', 'create');
    expect(stubs.focusFix).toHaveBeenCalledTimes(1);

    unmount();
  });

  it('handles Android shortcut: voice recording (emits editor:startAudioRecording)', () => {
    localStorage.setItem('android_shortcut_action', 'voice_recording');
    const { unmount } = render(<Harness />);

    expect(stubs.showEdit).toHaveBeenCalledWith('2xl', 'create');

    vi.advanceTimersByTime(300);
    expect(stubs.emit).toHaveBeenCalledWith('editor:startAudioRecording');

    unmount();
  });

  it('handles Android share intent text by opening editor with sanitized text', () => {
    localStorage.setItem('android_share_data', JSON.stringify({ text: '" hello "' }));
    const { unmount } = render(<Harness />);

    expect(stubs.showEdit).toHaveBeenCalledWith('2xl', 'create', { text: ' hello ' });

    unmount();
  });

  it('handles Android share intent file by reading stream and passing a File', async () => {
    localStorage.setItem('android_share_data', JSON.stringify({
      stream: '/tmp/share.bin',
      content_type: 'application/octet-stream',
      name: 'share.bin',
    }));

    const { unmount } = render(<Harness />);

    // Resolve the readFile promise.
    await Promise.resolve();

    expect(stubs.readFile).toHaveBeenCalledWith('/tmp/share.bin');
    expect(stubs.showEdit).toHaveBeenCalled();

    const call = stubs.showEdit.mock.calls.find((c) => c[2]?.file instanceof File);
    expect(call).toBeTruthy();
    expect(call![0]).toBe('2xl');
    expect(call![1]).toBe('create');
    expect((call![2].file as File).name).toBe('share.bin');

    unmount();
  });
});
