import React from "react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render } from "@testing-library/react";

vi.mock("@/lib/i18n", () => ({ default: { t: (k: string) => k } }));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (k: string) => k }),
  initReactI18next: {},
}));

vi.mock("@heroui/react", async (importOriginal) => {
  const actual: any = await importOriginal();
  return {
    ...actual,
    Tooltip: ({ children }: any) => <>{children}</>,
  };
});

vi.mock("@/components/Common/Iconify/icons", () => ({
  Icon: (props: any) => <span data-testid={`icon:${props.icon}`} />,
}));

const stubs = vi.hoisted(() => {
  return {
    emit: vi.fn(),
  };
});

vi.mock("@/lib/event", () => ({
  eventBus: {
    emit: (...args: any[]) => stubs.emit(...args),
  },
}));

import { InsertConextButton } from "../icons";

describe("InsertConextButton", () => {
  beforeEach(() => {
    stubs.emit.mockReset();
  });

  it("inserts markdown using the uploaded path (not blob preview)", () => {
    const file: any = {
      name: "excalidraw-123.png",
      preview: "blob:tauri://localhost/some-uuid",
      uploadPromise: {
        value: "/api/file/abc.png",
        loading: { value: false },
      },
    };

    const { getByTestId } = render(
      <InsertConextButton className="x" file={file} files={[file]} />,
    );

    const icon = getByTestId("icon:material-symbols:variable-insert-outline-rounded");
    fireEvent.click(icon.parentElement as HTMLElement);

    expect(stubs.emit).toHaveBeenCalledTimes(1);
    const [eventName, markdown] = stubs.emit.mock.calls[0];
    expect(eventName).toBe("editor:insert");
    expect(markdown).toBe("![excalidraw-123.png](/api/file/abc.png)");
    expect(markdown).not.toContain("blob:");
  });

  it("does not insert when only an unstable blob preview exists", () => {
    const file: any = {
      name: "excalidraw-123.png",
      preview: "blob:tauri://localhost/some-uuid",
      uploadPromise: {
        value: "",
        loading: { value: false },
      },
    };

    const { getByTestId } = render(
      <InsertConextButton className="x" file={file} files={[file]} />,
    );

    const icon = getByTestId("icon:material-symbols:variable-insert-outline-rounded");
    fireEvent.click(icon.parentElement as HTMLElement);

    expect(stubs.emit).not.toHaveBeenCalled();
  });
});
