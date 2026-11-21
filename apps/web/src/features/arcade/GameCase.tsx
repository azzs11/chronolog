import { rewindMoods } from '@chronolog/engine';
import { type ReactNode, useEffect, useMemo, useState } from 'react';
import type { PuzzleData } from '../puzzle/types';
import { townRoads } from '../town/roads';
import Dialog from './Dialog';
import { CLUE_NAMES, CLUES, type ClueKind, clockLabel, clueLine, endLine, finalMoods, isOver, MAX_GUESSES, missesOf, type Play, wrongGuessLine } from './game';
import Result from './Result';
import Scene from './Scene';
import { bleep, useArcadeSettings } from './settings';

const TAPE_STEP_MS = 450;

interface GameCaseProps {
  data: PuzzleData;
  /** Shown in the status bar: "1-3", "DAILY #4", "REAL 12". */
  caseLabel: string;
  play: Play;
  onPlay: (play: Play) => void;
  /** Tock's first line. */
  intro: string;
  /** Shown after the case, for teaching stages. */
  lesson?: string;
  /** Extra status text, like "YOU 8 · TOCK 5". */
  score?: string;
  /** Next case, share, "see it in ChronoLog"... */
  actions?: ReactNode;
}

/**
 * One case on the game screen: status bar, the town, the tape, two clue items, Tock's text box, and
 * the outcome when it ends. The caller keeps `play` (guesses and clues) and saves it.
 */
export default function GameCase({ data, caseLabel, play, onPlay, intro, lesson, score, actions }: GameCaseProps) {
  const [settings, setSettings] = useArcadeSettings();
  const rewind = useMemo(() => rewindMoods(data.timeline), [data.timeline]);
  const roads = useMemo(() => townRoads(data.graph, { withCorrelations: false, withPrior: false }), [data.graph]);
  const last = Math.max(0, rewind.frames.length - 1);
  const over = isOver(play, data.answer);
  const [frame, setFrame] = useState(over ? last : 0);
  const [isPlaying, setPlaying] = useState(false);
  const [selected, setSelected] = useState(data.services[0] ?? '');
  const [line, setLine] = useState(over ? endLine(data, play) : intro);

  useEffect(() => {
    if (!isPlaying) return;
    const timer = setInterval(() => setFrame((f) => (f >= last ? f : f + 1)), TAPE_STEP_MS);
    return () => clearInterval(timer);
  }, [isPlaying, last]);
  useEffect(() => {
    if (frame >= last) setPlaying(false);
  }, [frame, last]);

  const moods = rewind.frames[frame] ?? {};
  const misses = missesOf(play, data.answer);
  const hearts = MAX_GUESSES - misses;

  const accuse = (service: string) => {
    if (over || play.guesses.includes(service)) return;
    const next = { ...play, guesses: [...play.guesses, service] };
    onPlay(next);
    if (service === data.answer || next.guesses.length >= MAX_GUESSES) {
      setFrame(last);
      setLine(endLine(data, next));
      bleep(service === data.answer ? 'win' : 'wrong', settings.sound);
    } else {
      setLine(wrongGuessLine(service, data, finalMoods(rewind.frames), next));
      bleep('wrong', settings.sound);
    }
  };
  const spendClue = (kind: ClueKind) => {
    if (over || play.clues.includes(kind)) return;
    onPlay({ ...play, clues: [...play.clues, kind] });
    setLine(clueLine(kind, data));
    bleep('clue', settings.sound);
  };
  const playTape = () => {
    if (frame >= last) {
      setFrame(0);
      setPlaying(true);
    } else setPlaying(!isPlaying);
  };
  const select = (service: string) => {
    if (service === selected && !over) accuse(service);
    else {
      setSelected(service);
      bleep('select', settings.sound);
    }
  };

  return (
    <div className="arcade-cabinet">
      <div className="arcade-screen" data-scanlines={settings.scanlines ? 'on' : 'off'}>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1 bg-[color:var(--arcade-deep)] px-4 py-2 text-base">
          <span>
            CASE <b className="font-normal text-[color:var(--arcade-gold)]">{caseLabel}</b>
          </span>
          <span>
            GUESSES{' '}
            <span aria-hidden="true">
              <span className="text-[color:var(--arcade-heart)]">{'♥'.repeat(hearts)}</span>
              <span className="text-[color:var(--arcade-lost)]">{'♥'.repeat(misses)}</span>
            </span>
            <span className="sr-only">
              {hearts} of {MAX_GUESSES} left
            </span>
          </span>
          <span>
            CLUES <b className="font-normal text-[color:var(--arcade-gold)]">{CLUES.length - play.clues.length}</b>
          </span>
          <span>
            TIME <b className="font-normal text-[color:var(--arcade-gold)]">{clockLabel(rewind.seconds[frame] ?? 0)}</b>
          </span>
          {score && <span className="text-[color:var(--arcade-gold)]">{score}</span>}
          <span className="ml-auto flex gap-3 text-sm">
            <button type="button" className="underline decoration-dotted" aria-pressed={settings.scanlines} onClick={() => setSettings({ scanlines: !settings.scanlines })}>
              SCANLINES {settings.scanlines ? 'ON' : 'OFF'}
            </button>
            <button type="button" className="underline decoration-dotted" aria-pressed={settings.sound} onClick={() => setSettings({ sound: !settings.sound })}>
              SOUND {settings.sound ? 'ON' : 'OFF'}
            </button>
          </span>
        </div>

        <Scene
          services={data.services}
          roads={roads}
          moods={moods}
          clues={data.clues}
          showSaid={play.clues.includes('said') || over}
          showTalk={play.clues.includes('talk') || over}
          guesses={play.guesses}
          selected={selected}
          answer={over ? data.answer : null}
          onSelect={select}
        />

        <div className="flex flex-wrap items-center gap-4 px-4 pt-4">
          <button type="button" className="px-btn bg-pastel-sky" onClick={playTape}>
            {isPlaying ? '❚❚ PAUSE' : frame >= last ? '↺ REPLAY' : '▶ PLAY TAPE'}
          </button>
          <label htmlFor="arcade-tape" className="sr-only">
            Time in the incident
          </label>
          <input
            id="arcade-tape"
            type="range"
            min={0}
            max={last}
            value={frame}
            onChange={(e) => {
              setPlaying(false);
              setFrame(Number(e.target.value));
            }}
            aria-valuetext={clockLabel(rewind.seconds[frame] ?? 0)}
            className="min-w-32 flex-1 accent-[var(--accent-solid)]"
          />
        </div>
        {!over && (
          <div className="flex flex-wrap items-center gap-4 px-4 pt-4">
            {CLUES.map((kind) => (
              <button key={kind} type="button" className={`px-btn ${kind === 'said' ? 'bg-pastel-mint' : 'bg-pastel-pink'}`} disabled={play.clues.includes(kind)} onClick={() => spendClue(kind)}>
                CLUE: {CLUE_NAMES[kind].toUpperCase()}
              </button>
            ))}
            <button type="button" className="px-btn bg-pastel-butter sm:ml-auto" onClick={() => accuse(selected)} disabled={play.guesses.includes(selected)}>
              ACCUSE {selected.toUpperCase()}!
            </button>
          </div>
        )}
        <Dialog text={line} />
        {over && <Result data={data} play={play} lesson={lesson} actions={actions} />}
      </div>
    </div>
  );
}
