/** The reader's theme and density choices, saved in the browser and applied to <html>. */
import { useCallback, useEffect, useState } from 'react';

export type Theme = 'system' | 'dark' | 'light';
export type Density = 'comfortable' | 'compact';

export interface Preferences {
  theme: Theme;
  density: Density;
}

const STORAGE_KEY = 'chronolog.preferences.v1';
export const DEFAULT_PREFERENCES: Preferences = { theme: 'system', density: 'comfortable' };

const isTheme = (v: unknown): v is Theme => v === 'system' || v === 'dark' || v === 'light';
const isDensity = (v: unknown): v is Density => v === 'comfortable' || v === 'compact';

/** Saved choices, or the defaults when storage is missing, blocked or unreadable. */
export function loadPreferences(): Preferences {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
    if (parsed && typeof parsed === 'object') {
      const { theme, density } = parsed as Record<string, unknown>;
      return {
        theme: isTheme(theme) ? theme : DEFAULT_PREFERENCES.theme,
        density: isDensity(density) ? density : DEFAULT_PREFERENCES.density,
      };
    }
  } catch {
    // fall through to the defaults
  }
  return DEFAULT_PREFERENCES;
}

export function savePreferences(preferences: Preferences): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
  } catch {
    // The app works without storage; the choice just does not persist.
  }
}

/** "system" means no attribute, so the stylesheet follows prefers-color-scheme. */
export function applyPreferences(preferences: Preferences, root: HTMLElement = document.documentElement): void {
  if (preferences.theme === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', preferences.theme);
  root.setAttribute('data-density', preferences.density);
}

export function usePreferences(): [Preferences, (change: Partial<Preferences>) => void] {
  const [preferences, setPreferences] = useState<Preferences>(loadPreferences);
  useEffect(() => applyPreferences(preferences), [preferences]);
  const update = useCallback((change: Partial<Preferences>) => {
    setPreferences((current) => {
      const next = { ...current, ...change };
      savePreferences(next);
      return next;
    });
  }, []);
  return [preferences, update];
}
