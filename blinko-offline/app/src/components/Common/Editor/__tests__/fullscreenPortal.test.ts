import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const readEditorSource = () => {
  const file = path.resolve(__dirname, '..', 'index.tsx');
  return fs.readFileSync(file, 'utf8');
};
const readHooksSource = () => {
  const file = path.resolve(__dirname, '..', 'hooks', 'useEditor.ts');
  return fs.readFileSync(file, 'utf8');
};

describe('Editor fullscreen rendering', () => {
  it('keeps a single editor render path and applies fixed fullscreen classes inline', () => {
    const code = readEditorSource();
    expect(code).toContain("store.isFullscreen ? 'fixed inset-0 z-[2147483647] bg-background' : ''");
    expect(code).toContain('<div {...getRootProps()} className={editorRootClass}');
    expect(code).toContain('fixed inset-0 z-[2147483647] bg-background');
    expect(code).not.toContain('store.isFullscreen && createPortal(');
  });

  it('scopes fullscreen event handling to the emitting editor instance', () => {
    const editorCode = readEditorSource();
    const hooksCode = readHooksSource();
    expect(editorCode).toContain("editorId: store.instanceId");
    expect(editorCode).toContain("mode,");
    expect(hooksCode).toContain("payload.editorId !== store.instanceId");
    expect(hooksCode).toContain("payload.mode !== store.mode");
  });

  it('re-initializes editor when fullscreen state changes', () => {
    const hooksCode = readHooksSource();
    expect(hooksCode).toContain("store.isFullscreen");
  });

  it('registers and unregisters the same setViewMode handler', () => {
    const hooksCode = readHooksSource();
    expect(hooksCode).toContain("const handleSetViewMode = (mode: any) => {");
    expect(hooksCode).toContain("eventBus.on('editor:setViewMode', handleSetViewMode);");
    expect(hooksCode).toContain("eventBus.off('editor:setViewMode', handleSetViewMode);");
  });
});
