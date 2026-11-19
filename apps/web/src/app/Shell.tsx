import { Monitor, Moon, Rows3, Sun } from 'lucide-react';
import { NavLink, Outlet } from 'react-router-dom';
import { NAV_ITEMS } from './nav';
import { type Density, type Theme, usePreferences } from './preferences';

const THEMES: ReadonlyArray<{ value: Theme; label: string; icon: typeof Sun }> = [
  { value: 'system', label: 'System theme', icon: Monitor },
  { value: 'dark', label: 'Dark theme', icon: Moon },
  { value: 'light', label: 'Light theme', icon: Sun },
];

const linkClass = ({ isActive }: { isActive: boolean }): string =>
  `flex-1 flex-col items-center gap-1 rounded-md px-2 py-1.5 text-xs md:flex-none md:flex-row md:gap-3 md:px-3 md:py-2 md:text-sm ${
    isActive ? 'bg-bg-elevated text-text-primary' : 'text-text-secondary hover:bg-bg-surface hover:text-text-primary'
  }`;

/**
 * The frame every view lives in: a nav rail on wide screens, a bottom tab bar on phones, and a thin
 * header with the display preferences. Views fill the main area and may split it into a list and a
 * detail pane.
 */
export default function Shell() {
  const [preferences, setPreferences] = usePreferences();
  const nextDensity: Density = preferences.density === 'comfortable' ? 'compact' : 'comfortable';

  return (
    <div className="flex h-full flex-col md:flex-row">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded-md focus:bg-accent-solid focus:px-3 focus:py-2 focus:text-accent-fg"
      >
        Skip to content
      </a>

      <nav
        aria-label="Main"
        className="order-last flex shrink-0 justify-around border-t border-border-dim bg-bg-surface p-1 md:order-first md:w-56 md:flex-col md:justify-start md:gap-1 md:border-r md:border-t-0 md:p-3"
      >
        <span className="hidden px-3 pb-3 pt-1 text-xl font-semibold md:block">ChronoLog</span>
        {NAV_ITEMS.map(({ path, label, icon: Icon, hideOnPhone }) => (
          <NavLink key={path} to={path} className={(state) => `${hideOnPhone ? 'hidden md:flex' : 'flex'} ${linkClass(state)}`}>
            <Icon size={18} aria-hidden="true" />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>

      <div className="flex min-h-0 flex-1 flex-col">
        <header className="flex shrink-0 items-center justify-end gap-1 border-b border-border-dim px-4 py-2">
          <fieldset className="flex rounded-md border border-border-dim">
            <legend className="sr-only">Theme</legend>
            {THEMES.map(({ value, label, icon: Icon }) => (
              <button
                key={value}
                type="button"
                aria-label={label}
                aria-pressed={preferences.theme === value}
                title={label}
                onClick={() => setPreferences({ theme: value })}
                className={`p-2 ${preferences.theme === value ? 'bg-bg-elevated text-text-primary' : 'text-text-secondary'}`}
              >
                <Icon size={16} aria-hidden="true" />
              </button>
            ))}
          </fieldset>
          <button
            type="button"
            aria-label={`Switch to ${nextDensity} density`}
            aria-pressed={preferences.density === 'compact'}
            title={`Density: ${preferences.density}`}
            onClick={() => setPreferences({ density: nextDensity })}
            className="rounded-md border border-border-dim p-2 text-text-secondary"
          >
            <Rows3 size={16} aria-hidden="true" />
          </button>
        </header>
        <main id="main" tabIndex={-1} className="min-h-0 flex-1 overflow-y-auto p-4 md:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
