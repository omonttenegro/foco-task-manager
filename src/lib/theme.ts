import type { AppAccent, Theme } from '../../shared/types';

const browserColors: Record<AppAccent, { light: string; dark: string }> = {
  pink: { light: '#f7cfdf', dark: '#0c0d10' },
  blue: { light: '#dce9f8', dark: '#0c0d10' },
  violet: { light: '#e7def7', dark: '#0c0d10' },
  emerald: { light: '#dcefe9', dark: '#0c0d10' },
};

const accentValues: AppAccent[] = ['pink', 'blue', 'violet', 'emerald'];
const accentStorageKey = 'foco-accent';

function isAccent(value: string | null | undefined): value is AppAccent {
  return accentValues.includes(value as AppAccent);
}

export function getAppliedAccent(fallback: AppAccent = 'pink'): AppAccent {
  const appliedAccent = document.documentElement.dataset.accent;
  if (isAccent(appliedAccent)) return appliedAccent;

  try {
    const storedAccent = window.localStorage.getItem(accentStorageKey);
    if (isAccent(storedAccent)) return storedAccent;
  } catch {
    // The visual theme still works when storage is unavailable.
  }

  return fallback;
}

export function applyTheme(theme: Theme, accent?: AppAccent) {
  const resolvedAccent = accent ?? getAppliedAccent();
  const dark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  const resolvedTheme = dark ? 'dark' : 'light';
  const themeColor = browserColors[resolvedAccent][resolvedTheme];

  try {
    window.localStorage.setItem(accentStorageKey, resolvedAccent);
  } catch {
    // Keep applying the theme even when storage is unavailable.
  }

  document.documentElement.dataset.theme = resolvedTheme;
  document.documentElement.dataset.accent = resolvedAccent;
  document.documentElement.style.colorScheme = resolvedTheme;
  document.documentElement.style.backgroundColor = themeColor;
  document.body.style.backgroundColor = themeColor;
  document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')?.setAttribute('content', themeColor);
}
