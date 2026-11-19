import { applyPreferences, DEFAULT_PREFERENCES, loadPreferences, savePreferences } from './preferences';

describe('preferences', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.removeAttribute('data-density');
  });

  it('defaults to the system theme and comfortable density', () => {
    expect(loadPreferences()).toEqual(DEFAULT_PREFERENCES);
  });

  it('saves and reloads a choice', () => {
    savePreferences({ theme: 'light', density: 'compact' });
    expect(loadPreferences()).toEqual({ theme: 'light', density: 'compact' });
  });

  it('ignores corrupt or unknown saved values field by field', () => {
    localStorage.setItem('chronolog.preferences.v1', JSON.stringify({ theme: 'neon', density: 'compact' }));
    expect(loadPreferences()).toEqual({ theme: 'system', density: 'compact' });
    localStorage.setItem('chronolog.preferences.v1', '{nope');
    expect(loadPreferences()).toEqual(DEFAULT_PREFERENCES);
  });

  it('survives storage that throws', () => {
    const get = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(loadPreferences()).toEqual(DEFAULT_PREFERENCES);
    get.mockRestore();
    const set = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(() => savePreferences(DEFAULT_PREFERENCES)).not.toThrow();
    set.mockRestore();
  });

  it('"system" leaves data-theme off so the stylesheet follows the system, and a choice sets it', () => {
    applyPreferences({ theme: 'dark', density: 'compact' });
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(document.documentElement.getAttribute('data-density')).toBe('compact');
    applyPreferences({ theme: 'system', density: 'comfortable' });
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
  });
});
