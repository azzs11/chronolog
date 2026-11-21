import { useEffect, useState } from 'react';

/** Changes whenever the page's theme changes, so things drawn with resolved colours can redraw. */
const read = (): string => document.documentElement.getAttribute('data-theme') ?? 'system';

export function useThemeVersion(): string {
  const [version, setVersion] = useState(read);
  useEffect(() => {
    const observer = new MutationObserver(() => setVersion(read()));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    const media = window.matchMedia?.('(prefers-color-scheme: dark)');
    const onMedia = () => setVersion(`${read()}:${media?.matches ? 'dark' : 'light'}`);
    media?.addEventListener?.('change', onMedia);
    return () => {
      observer.disconnect();
      media?.removeEventListener?.('change', onMedia);
    };
  }, []);
  return version;
}
