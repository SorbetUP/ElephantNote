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

// Replace motion.div with a plain div that preserves event handlers.
vi.mock("motion/react", () => ({
  motion: {
    // eslint-disable-next-line react/display-name
    div: (props: any) => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { whileTap, whileHover, animate, transition, ...rest } = props;
      return <div {...rest} />;
    },
  },
}));

const stubs = vi.hoisted(() => {
  return {
    showDialog: vi.fn(),
  };
});

vi.mock("@/components/Common/Excalidraw/ExcalidrawEditorDialog", () => ({
  showExcalidrawEditorDialog: (...args: any[]) => stubs.showDialog(...args),
}));

import { ExcalidrawButton } from "./index";

describe("ExcalidrawButton", () => {
  beforeEach(() => {
    stubs.showDialog.mockReset();
  });

  it("opens Excalidraw for a new drawing and routes onSave -> onFileUpload", async () => {
    const onFileUpload = vi.fn().mockResolvedValue(undefined);
    vi.spyOn(Date, "now").mockReturnValue(1700000000000);

    const { getByTestId } = render(<ExcalidrawButton onFileUpload={onFileUpload} />);

    const icon = getByTestId("icon:simple-icons:excalidraw");
    const clickable = icon.parentElement as HTMLElement;
    fireEvent.click(clickable);

    expect(stubs.showDialog).toHaveBeenCalledTimes(1);
    const opts = stubs.showDialog.mock.calls[0]?.[0];
    expect(opts.title).toBe("Excalidraw");
    expect(opts.initialFileName).toBe("excalidraw-1700000000000.png");
    expect(typeof opts.onSave).toBe("function");

    const blob = new Blob(["png"], { type: "image/png" });
    await opts.onSave({ blob, fileName: "my-drawing.png" });

    expect(onFileUpload).toHaveBeenCalledTimes(1);
    const [files] = onFileUpload.mock.calls[0];
    expect(files).toHaveLength(1);
    expect(files[0]).toBeInstanceOf(File);
    expect(files[0].name).toBe("my-drawing.png");
    expect(files[0].type).toBe("image/png");
  });

  it("clicking import triggers file input click and onChange opens Excalidraw with initialBlob", async () => {
    const onFileUpload = vi.fn().mockResolvedValue(undefined);
    const clickSpy = vi.spyOn(HTMLInputElement.prototype, "click");

    const { container, getByTestId } = render(<ExcalidrawButton onFileUpload={onFileUpload} />);

    const importIcon = getByTestId("icon:material-symbols:image-outline");
    fireEvent.click(importIcon.parentElement as HTMLElement);
    expect(clickSpy).toHaveBeenCalledTimes(1);

    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    expect(input).toBeTruthy();

    const original = new File(["raw"], "source.jpg", { type: "image/jpeg" });
    fireEvent.change(input, { target: { files: [original] } });

    expect(stubs.showDialog).toHaveBeenCalledTimes(1);
    const opts = stubs.showDialog.mock.calls[0]?.[0];
    expect(opts.title).toBe("Excalidraw");
    expect(opts.initialFileName).toBe("source.jpg");
    expect(opts.initialBlob).toBeInstanceOf(Blob);
    expect(opts.initialBlob.type).toBe("image/jpeg");

    const blob = new Blob(["png"], { type: "image/png" });
    await opts.onSave({ blob, fileName: "result.png" });

    expect(onFileUpload).toHaveBeenCalledTimes(1);
    const [files] = onFileUpload.mock.calls[0];
    expect(files).toHaveLength(1);
    expect(files[0]).toBeInstanceOf(File);
    expect(files[0].name).toBe("result.png");
  });
});

