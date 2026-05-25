import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';

import { useDragCard } from './useDragCard';

vi.mock('@/lib/i18n', () => ({ default: { t: (k: string) => k } }));

const core = vi.hoisted(() => {
  const calls: any[] = [];
  return {
    calls,
    MouseSensor: Symbol('MouseSensor'),
    TouchSensor: Symbol('TouchSensor'),
    useSensor: vi.fn((sensor: any, opts: any) => {
      calls.push({ sensor, opts });
      return { sensor, opts };
    }),
    useSensors: vi.fn((...sensors: any[]) => sensors),
    closestCenter: vi.fn(),
    useDroppable: vi.fn(),
    useDraggable: vi.fn(),
  };
});

vi.mock('@dnd-kit/core', () => core);

const stubs = vi.hoisted(() => ({
  blinko: {
    fullscreenEditorNoteId: null as number | null,
  },
}));

vi.mock('@/store', () => ({
  RootStore: {
    Get: () => stubs.blinko,
  },
}));

vi.mock('@/store/blinkoStore', () => ({
  BlinkoStore: class BlinkoStore {},
}));

vi.mock('@/lib/trpc', () => ({
  api: {
    notes: { updateNotesOrder: { mutate: vi.fn() } },
  },
}));

// Not under test; required by module imports.
vi.mock('@/components/BlinkoCard', () => ({ BlinkoCard: () => null }));
vi.mock('@/components/Common/Iconify/icons', () => ({ Icon: () => null }));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
  initReactI18next: {},
}));

function Harness() {
  useDragCard({
    notes: [{ id: 1, isTop: false, sortOrder: 0 }],
    activeId: null,
    setActiveId: () => {},
    insertPosition: null,
    setInsertPosition: () => {},
    isDragForbidden: false,
    setIsDragForbidden: () => {},
  });
  return <div />;
}

describe('useDragCard (desktop mouse DnD wiring)', () => {
  beforeEach(() => {
    core.calls.length = 0;
    stubs.blinko.fullscreenEditorNoteId = null;
    core.useSensor.mockClear();
    core.useSensors.mockClear();
  });

  it('configures MouseSensor with a desktop-friendly activation constraint', () => {
    render(<Harness />);

    const mouseCall = core.calls.find((c) => c.sensor === core.MouseSensor);
    expect(mouseCall).toBeTruthy();
    expect(mouseCall.opts.activationConstraint).toMatchObject({ delay: 250, tolerance: 5 });
  });

  it('disables drag sensors when fullscreen editor is open', () => {
    stubs.blinko.fullscreenEditorNoteId = 123;
    render(<Harness />);

    const mouseCall = core.calls.find((c) => c.sensor === core.MouseSensor);
    expect(mouseCall).toBeTruthy();
    expect(mouseCall.opts.activationConstraint).toMatchObject({ delay: 999999, distance: 999999 });
  });
});
