import { describe, expect, it } from 'vitest';
import { getHighlightStyle, resolveEditorTheme } from '../hooks/theme';

describe('Editor theme resolution', () => {
  it('prefers resolvedTheme when available', () => {
    expect(resolveEditorTheme('light', 'dark')).toBe('dark');
    expect(resolveEditorTheme('dark', 'light')).toBe('light');
  });

  it('falls back to direct theme value for dark/light', () => {
    expect(resolveEditorTheme('dark', undefined)).toBe('dark');
    expect(resolveEditorTheme('light', undefined)).toBe('light');
  });

  it('falls back to html class when theme is system/unknown', () => {
    document.documentElement.classList.remove('dark', 'light');
    document.documentElement.classList.add('dark');
    expect(resolveEditorTheme('system', undefined)).toBe('dark');

    document.documentElement.classList.remove('dark', 'light');
    document.documentElement.classList.add('light');
    expect(resolveEditorTheme('system', undefined)).toBe('light');
  });

  it('falls back to body class when html has no theme class', () => {
    document.documentElement.classList.remove('dark', 'light');
    document.body.classList.remove('dark', 'light');
    document.body.classList.add('dark');
    expect(resolveEditorTheme('system', undefined)).toBe('dark');
  });

  it('maps dark/light theme to highlight style', () => {
    expect(getHighlightStyle('dark')).toBe('github-dark');
    expect(getHighlightStyle('light')).toBe('github');
    expect(getHighlightStyle('system')).toBe('github');
  });
});
