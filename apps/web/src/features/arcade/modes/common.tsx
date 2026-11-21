import type { ReactNode } from 'react';

/** The strip above every mode: back to the world map, and the mode's name. */
export function ModeBar({ title, onHome, children }: { title: string; onHome: () => void; children?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-4 font-pixel">
      <button type="button" className="px-btn bg-pastel-lilac" onClick={onHome}>
        ◀ MAP
      </button>
      <h2 className="font-pixel text-2xl text-text-primary">{title}</h2>
      {children}
    </div>
  );
}

/** "See it in ChronoLog": a button into the matching place in the app, or a sentence in the static demo. */
export function AppLink({ path, label, onOpenApp }: { path: string; label: string; onOpenApp?: (path: string) => void }) {
  if (!onOpenApp) return <p className="font-sans text-sm text-[color:var(--arcade-dim)]">In the self-hosted app this lesson continues in {path.replace('/', 'the ')} view.</p>;
  return (
    <button type="button" className="px-btn bg-pastel-sky" onClick={() => onOpenApp(path)}>
      {label}
    </button>
  );
}
