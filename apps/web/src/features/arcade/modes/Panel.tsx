import type { ReactNode } from 'react';
import Dialog from '../Dialog';
import { useArcadeSettings } from '../settings';

/** A list screen inside the cabinet (case lists, empty states), with Tock's line at the bottom. */
export default function Panel({ title, children, tock }: { title: string; children: ReactNode; tock?: string }) {
  const [settings] = useArcadeSettings();
  return (
    <div className="arcade-cabinet">
      <div className="arcade-screen" data-scanlines={settings.scanlines ? 'on' : 'off'}>
        <div className="bg-[color:var(--arcade-deep)] px-4 py-2 text-center text-xl tracking-widest text-[color:var(--arcade-gold)]">{title}</div>
        <div className="arcade-grass p-4 sm:p-6">{children}</div>
        {tock && <Dialog text={tock} />}
      </div>
    </div>
  );
}
