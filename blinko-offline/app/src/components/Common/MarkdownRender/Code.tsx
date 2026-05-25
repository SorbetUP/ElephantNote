import { useTheme } from 'next-themes';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus, oneLight } from 'react-syntax-highlighter/dist/cjs/styles/prism';
import { Copy } from '../Copy';

interface CodeProps {
  className?: string;
  children?: any;
  [key: string]: any;
}

export const Code = ({ className, children, ...props }: CodeProps) => {
  const { theme, resolvedTheme } = useTheme()
  
  if (!children) return null;
  
  const match = /language-(\w+)/.exec(className || '');
  
  const shouldHighlight = !className || className?.includes('language-') || className?.includes('hljs');
  
  const isCodeBlock = shouldHighlight && (String(children).includes('\n') || (className && className.includes('language-')));
  const activeTheme = (() => {
    if (resolvedTheme === 'dark' || resolvedTheme === 'light') return resolvedTheme;
    if (theme === 'dark' || theme === 'light') return theme;
    if (typeof document !== 'undefined') {
      if (document.documentElement.classList.contains('dark')) return 'dark';
      if (document.body?.classList.contains('dark')) return 'dark';
      if (document.documentElement.classList.contains('light')) return 'light';
      if (document.body?.classList.contains('light')) return 'light';
      if (window.matchMedia?.('(prefers-color-scheme: dark)')?.matches) return 'dark';
    }
    return 'light';
  })();

  return isCodeBlock ? (
    <div className="relative group">
      <Copy content={String(children).replace(/\n$/, '')} size={16} className="absolute right-2 top-2 opacity-0 group-hover:opacity-100 transition-opacity" />
      <SyntaxHighlighter
        {...props}
        PreTag="div"
        children={String(children).replace(/\n$/, '')}
        language={match ? match[1] : 'text'}
        customStyle={{
          borderRadius: '16px',
        }}
        style={activeTheme === 'light' ? oneLight : vscDarkPlus}
      />
    </div>
  ) : (
    <code className={`${className || ''} px-1 py-0.5 rounded bg-gray-100 dark:bg-gray-800`} {...props}>
      {children}
    </code>
  );
}; 
