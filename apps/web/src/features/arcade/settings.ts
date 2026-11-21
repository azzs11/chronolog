/** Arcade settings, per browser: scanlines (on by default) and sound (off by default). */
import { useCallback, useState } from 'react';

export interface ArcadeSettings {
  scanlines: boolean;
  sound: boolean;
}

const KEY = 'chronolog.arcade.settings.v1';
const DEFAULTS: ArcadeSettings = { scanlines: true, sound: false };

function load(): ArcadeSettings {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<ArcadeSettings>;
    return { scanlines: typeof r.scanlines === 'boolean' ? r.scanlines : DEFAULTS.scanlines, sound: typeof r.sound === 'boolean' ? r.sound : DEFAULTS.sound };
  } catch {
    return DEFAULTS;
  }
}

export function useArcadeSettings(): [ArcadeSettings, (change: Partial<ArcadeSettings>) => void] {
  const [settings, setSettings] = useState(load);
  const update = useCallback((change: Partial<ArcadeSettings>) => {
    setSettings((s) => {
      const next = { ...s, ...change };
      try {
        localStorage.setItem(KEY, JSON.stringify(next));
      } catch {
        // not remembered, still works
      }
      return next;
    });
  }, []);
  return [settings, update];
}

type Cue = 'select' | 'wrong' | 'win' | 'clue';
const CUES: Record<Cue, number[]> = { select: [660], wrong: [220, 165], win: [523, 659, 784], clue: [880, 990] };
const NOTE_S = 0.09;

/** A few square-wave bleeps, generated on the spot (no sound files). Only ever called after a click. */
export function bleep(cue: Cue, isOn: boolean): void {
  if (!isOn || typeof window.AudioContext !== 'function') return;
  const audio = new window.AudioContext();
  CUES[cue].forEach((freq, i) => {
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.type = 'square';
    osc.frequency.value = freq;
    gain.gain.value = 0.04;
    osc.connect(gain).connect(audio.destination);
    osc.start(audio.currentTime + i * NOTE_S);
    osc.stop(audio.currentTime + (i + 1) * NOTE_S);
  });
  setTimeout(() => void audio.close(), (CUES[cue].length + 1) * NOTE_S * 1000);
}
