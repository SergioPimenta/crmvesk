export type Theme = 'dark' | 'light';

const STORAGE_KEY = 'crm_theme';

export function getStoredTheme(): Theme {
  if (typeof window === 'undefined') return 'dark';
  return localStorage.getItem(STORAGE_KEY) === 'light' ? 'light' : 'dark';
}

/** Aplica o tema no elemento raiz (data-theme="light" ativa os overrides claros). */
export function applyTheme(theme: Theme) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (theme === 'light') root.setAttribute('data-theme', 'light');
  else root.removeAttribute('data-theme');
}

export function setStoredTheme(theme: Theme) {
  if (typeof window !== 'undefined') localStorage.setItem(STORAGE_KEY, theme);
  applyTheme(theme);
}
