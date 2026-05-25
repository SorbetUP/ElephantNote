import React from "react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, fireEvent, screen } from "@testing-library/react";

import { BackupSetting } from "./BackupSetting";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

vi.mock("@/components/Common/Iconify/icons", () => ({
  Icon: () => <span />,
}));

vi.mock("@/store", () => ({
  RootStore: {
    Get: () => ({ loading: () => {}, dismiss: () => {}, success: () => {}, error: () => {} }),
  },
}));

vi.mock("@/store/module/Toast/Toast", () => ({
  ToastPlugin: class ToastPlugin {},
}));

vi.mock("@/lib/tauriHelper", () => ({
  isInTauri: () => true,
}));

const invokeSpy = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: any[]) => invokeSpy(...args),
}));

const presentShareSheetSpy = vi.fn();
vi.mock("tauri-plugin-blinko-api", () => ({
  presentShareSheet: (...args: any[]) => presentShareSheetSpy(...args),
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: vi.fn(async () => null),
}));

vi.mock("@heroui/react", () => ({
  Card: ({ children }: any) => <div>{children}</div>,
  Button: ({ children, onPress }: any) => (
    <button type="button" onClick={onPress}>
      {children}
    </button>
  ),
}));

describe("BackupSetting", () => {
  beforeEach(() => {
    invokeSpy.mockReset();
    presentShareSheetSpy.mockReset();
  });

  it("exports and triggers the share sheet", async () => {
    invokeSpy.mockResolvedValueOnce({
      path: "/tmp/test.bko",
      filename: "test.bko",
      size: 1,
    });

    render(<BackupSetting />);
    fireEvent.click(screen.getByText("backup-create"));

    expect(invokeSpy).toHaveBeenCalledWith("export_local_backup");
    // share sheet is awaited after export
    await Promise.resolve();
    expect(presentShareSheetSpy).toHaveBeenCalledWith({
      path: "/tmp/test.bko",
      mime: "application/zip",
      filename: "test.bko",
    });
  });
});

