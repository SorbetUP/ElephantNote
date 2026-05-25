import React from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import { TagListPanel } from "./TagListPanel";

vi.mock("@/lib/i18n", () => ({ default: { t: (k: string) => k } }));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (k: string) => k }),
  initReactI18next: {},
}));

vi.mock("next-themes", () => ({
  useTheme: () => ({ theme: "light", resolvedTheme: "light" }),
}));

vi.mock("usehooks-ts", () => ({
  useMediaQuery: () => false, // mobile
}));

const handleExpandSpy = vi.fn();

vi.mock("react-accessible-treeview", () => ({
  __esModule: true,
  default: ({ nodeRenderer }: any) => (
    <div>
      {nodeRenderer({
        element: { id: 1, name: "Welcome", metadata: {}, children: [2, 3] },
        isBranch: true,
        isExpanded: false,
        getNodeProps: () => ({}),
        level: 1,
        handleExpand: handleExpandSpy,
      })}
    </div>
  ),
  flattenTree: (tree: any) => tree,
}));

vi.mock("@/lib/trpc", () => ({
  api: {
    tags: {
      updateTagIcon: { mutate: vi.fn() },
      updateTagName: { mutate: vi.fn() },
      updateTagOrder: { mutate: vi.fn() },
      deleteOnlyTag: { mutate: vi.fn() },
      deleteTagWithAllNote: { mutate: vi.fn() },
    },
  },
}));

vi.mock("@/components/Common/Iconify/icons", () => ({
  Icon: ({ icon }: any) => <span data-testid={`icon:${icon}`} />,
}));

vi.mock("@/store", () => {
  const blinko = {
    allTagRouter: { title: "total", href: "/?path=all", icon: "" },
    noteListFilterConfig: { tagId: null },
    updateTagFilter: vi.fn(),
    tagList: { value: { listTags: [{ id: 1, name: "Welcome", children: [] }] } },
  };
  const base = { currentRouter: null };
  return {
    RootStore: {
      Get: (klass: any) => {
        if (klass?.name === "BlinkoStore") return blinko;
        if (klass?.name === "BaseStore") return base;
        return {};
      },
    },
  };
});

vi.mock("@/store/baseStore", () => ({ BaseStore: class BaseStore {} }));
vi.mock("@/store/blinkoStore", () => ({ BlinkoStore: class BlinkoStore {} }));
vi.mock("@/store/module/Dialog", () => ({ DialogStore: class DialogStore {} }));
vi.mock("@/store/aiStore", () => ({ AiStore: class AiStore {} }));
vi.mock("@/lib/event", () => ({ eventBus: { emit: vi.fn() } }));
vi.mock("./UpdateTagPop", () => ({ ShowUpdateTagDialog: vi.fn() }));
vi.mock("@/store/standard/PromiseState", () => ({ PromiseCall: (p: any) => p }));

describe("TagListPanel (mobile)", () => {
  it("renders an always-visible expand/collapse button for branch tags", () => {
    render(
      <MemoryRouter initialEntries={["/?path=all"]}>
        <TagListPanel />
      </MemoryRouter>,
    );

    expect(screen.getByRole("button", { name: "Expand tag group" })).toBeTruthy();
    expect(screen.getByTestId("icon:gravity-ui:caret-right")).toBeTruthy();
  });
});
