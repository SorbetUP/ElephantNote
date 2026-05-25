import React from "react";
import { describe, expect, it, vi } from "vitest";
import { render, fireEvent, screen } from "@testing-library/react";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (k: string, opts?: any) => `${k}:${opts?.count ?? ""}`,
  }),
  // Some modules initialize i18n and require this export to exist.
  initReactI18next: { type: "3rdParty", init: () => {} },
}));

vi.mock("@/components/Common/Iconify/icons", () => ({
  Icon: ({ icon }: any) => <span data-testid={`icon:${icon}`} />,
}));

vi.mock("@heroui/react", () => ({
  Tooltip: ({ children }: any) => <div>{children}</div>,
}));

vi.mock("@/store", () => ({
  RootStore: {
    Get: () => ({}),
  },
}));

vi.mock("../BlinkoRightClickMenu", () => ({
  ConvertItemFunction: vi.fn(),
  ShowEditTimeModel: vi.fn(),
}));

vi.mock("./commentButton", () => ({
  CommentCount: () => null,
}));

vi.mock("@/lib/dayjs", () => ({
  default: () => ({ isBefore: () => false, diff: () => 0, format: () => "" }),
}));

import { eventBus } from "@/lib/event";
import { CardFooter } from "./cardFooter";

describe("CardFooter (used elements toggle)", () => {
  it("renders the toggle next to Blinko and emits showUsed state for the noteId", () => {
    const emitSpy = vi.spyOn(eventBus, "emit");
    const blinkoItem: any = {
      id: 1,
      type: 0,
      content: "![a.png](/api/file/532)",
      attachments: [{ name: "a.png", path: "/api/file/532", type: "image/png", size: 1 }],
    };

    render(<CardFooter blinkoItem={blinkoItem} blinko={{} as any} />);

    const btn = screen.getByRole("button", { name: "show-used-attachments:1" });
    fireEvent.click(btn);
    expect(emitSpy).toHaveBeenCalledWith("attachments:setShowUsed", { noteId: 1, showUsed: true });
  });
});
