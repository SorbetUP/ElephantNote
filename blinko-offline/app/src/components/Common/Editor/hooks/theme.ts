export const resolveEditorTheme = (
  theme?: string | null,
  resolvedTheme?: string | null,
): 'dark' | 'light' => {
  if (resolvedTheme === 'dark' || resolvedTheme === 'light') {
    return resolvedTheme;
  }
  if (theme === 'dark' || theme === 'light') {
    return theme;
  }

  if (typeof document !== 'undefined') {
    if (document.documentElement.classList.contains('dark')) return 'dark';
    if (document.body?.classList.contains('dark')) return 'dark';
    if (document.documentElement.classList.contains('light')) return 'light';
    if (document.body?.classList.contains('light')) return 'light';
    if (window.matchMedia?.('(prefers-color-scheme: dark)')?.matches) return 'dark';
  }

  return 'light';
};

export const getHighlightStyle = (theme: string): 'github' | 'github-dark' => {
  return theme === 'dark' ? 'github-dark' : 'github';
};
