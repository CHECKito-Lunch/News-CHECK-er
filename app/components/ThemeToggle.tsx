'use client';

import { useEffect, useState } from 'react';

function useTheme() {
  const [mounted, setMounted] = useState(false);
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    setMounted(true);
    const root = document.documentElement;
    const stored = localStorage.getItem('theme');
    const prefers = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const shouldDark = stored ? stored === 'dark' : prefers;
    root.classList.toggle('dark', shouldDark);
    setIsDark(shouldDark);
  }, []);

  const toggle = () => {
    const next = !isDark;
    document.documentElement.classList.toggle('dark', next);
    localStorage.setItem('theme', next ? 'dark' : 'light');
    setIsDark(next);
  };

  return { mounted, isDark, toggle };
}

export default function ThemeToggle() {
  const { mounted, isDark, toggle } = useTheme();
  if (!mounted) return null;

  return (
    <button
      onClick={toggle}
      className="px-3 py-1.5 rounded-lg border text-sm
                 bg-white text-gray-700 hover:bg-gray-50 border-gray-200
                 dark:bg-gray-800 dark:text-gray-200 dark:border-gray-700 dark:hover:bg-gray-700"
      title="Theme umschalten"
      type="button"
    >
      {isDark ? '☀️' : '🌙'}
    </button>
  );
}