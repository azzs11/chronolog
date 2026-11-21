import { useEffect, useState } from 'react';
import { TOCK_LOOK } from '../../app/critters/Tock';
import PixelCritter from './PixelCritter';

const TYPE_MS = 18;
const reducedMotion = (): boolean => typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Tock's RPG text box. The line types out (instantly with reduced motion); screen readers get it whole. */
export default function Dialog({ text, speaker = 'TOCK' }: { text: string; speaker?: string }) {
  const [shown, setShown] = useState(reducedMotion() ? text.length : 0);
  useEffect(() => {
    if (reducedMotion()) {
      setShown(text.length);
      return;
    }
    setShown(0);
    const timer = setInterval(() => setShown((n) => (n >= text.length ? n : n + 1)), TYPE_MS);
    return () => clearInterval(timer);
  }, [text]);
  const isTyping = shown < text.length;
  return (
    <div className="px-window grid grid-cols-[64px_1fr] items-start gap-3 p-3">
      <span className="bg-pastel-lilac p-1 shadow-[0_0_0_3px_var(--arcade-frame)]">
        <PixelCritter name="Tock" mood="fine" size={56} look={TOCK_LOOK} />
      </span>
      <div className="min-w-0">
        <p className="text-sm text-[color:var(--arcade-frame)] opacity-70">{speaker}</p>
        <p className="min-h-[3.2em] text-lg leading-snug" aria-hidden="true">
          {text.slice(0, shown)}
          {!isTyping && <span className="blink ml-1">▼</span>}
        </p>
        <p className="sr-only" aria-live="polite">
          {text}
        </p>
      </div>
    </div>
  );
}
