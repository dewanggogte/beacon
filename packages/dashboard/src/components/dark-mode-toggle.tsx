'use client';

import { useTheme } from './theme-provider';

export function DarkModeToggle() {
  const { resolvedTheme, setTheme } = useTheme();

  function toggle() {
    setTheme(resolvedTheme === 'dark' ? 'light' : 'dark');
  }

  return (
    <button
      onClick={toggle}
      aria-label={resolvedTheme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
      className="rounded-md p-1.5 text-base leading-none transition-colors hover:bg-bg-hover dark:hover:bg-dark-bg-hover"
    >
      {resolvedTheme === 'dark' ? '☀️' : '🌙'}
    </button>
  );
}
