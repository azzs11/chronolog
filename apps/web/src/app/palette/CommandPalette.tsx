import { useEffect, useId, useMemo, useRef, useState } from 'react';
import Tock from '../critters/Tock';
import { type Command, filterCommands } from './commands';

interface PaletteProps {
  isOpen: boolean;
  onClose: () => void;
  commands: readonly Command[];
}

/**
 * "Ask Tock": type to find a view, an Arcade game, a setting or a recent incident. A combobox with a
 * list of options; arrows move, Enter runs, Escape closes, and focus returns to where it was.
 */
export default function CommandPalette({ isOpen, onClose, commands }: PaletteProps) {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const returnTo = useRef<Element | null>(null);
  const listId = useId();
  const results = useMemo(() => filterCommands(commands, query), [commands, query]);

  useEffect(() => {
    if (!isOpen) return;
    returnTo.current = document.activeElement;
    setQuery('');
    setActive(0);
    input.current?.focus();
    return () => (returnTo.current as HTMLElement | null)?.focus?.();
  }, [isOpen]);

  if (!isOpen) return null;
  const run = (c: Command | undefined) => {
    if (!c) return;
    onClose();
    c.run();
  };
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
    else if (e.key === 'ArrowDown') setActive((a) => Math.min(a + 1, results.length - 1));
    else if (e.key === 'ArrowUp') setActive((a) => Math.max(a - 1, 0));
    else if (e.key === 'Enter') run(results[active]);
    else return;
    e.preventDefault();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center px-4 pt-[12vh]">
      <button type="button" tabIndex={-1} aria-label="Close Ask Tock" className="absolute inset-0 cursor-default bg-ink/30" onClick={onClose} />
      <div role="dialog" aria-modal="true" aria-label="Ask Tock" className="card relative w-full max-w-lg space-y-2 p-3">
        <div className="flex items-center gap-2">
          <Tock size={32} />
          <input
            ref={input}
            role="combobox"
            aria-expanded="true"
            aria-controls={listId}
            aria-activedescendant={results[active] ? `${listId}-${results[active].id}` : undefined}
            aria-label="Ask Tock: type a view, a game or a setting"
            placeholder="Where to? Try “daily” or “night”"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            onKeyDown={onKeyDown}
            className="field flex-1"
          />
        </div>
        <div id={listId} role="listbox" aria-label="Commands" className="max-h-80 overflow-y-auto">
          {results.length === 0 && <p className="px-3 py-2 text-sm text-text-muted">Nothing matches “{query}”.</p>}
          {results.map((c, i) => (
            <div
              key={c.id}
              id={`${listId}-${c.id}`}
              role="option"
              tabIndex={-1}
              aria-selected={i === active}
              onMouseEnter={() => setActive(i)}
              onMouseDown={(e) => {
                e.preventDefault();
                run(c);
              }}
              className={`flex cursor-pointer items-center justify-between gap-3 rounded-xl px-3 py-2 text-sm ${i === active ? 'bg-pastel-lilac text-on-pastel' : 'text-text-primary'}`}
            >
              <span>{c.label}</span>
              <span className={`text-xs ${i === active ? '' : 'text-text-muted'}`}>{c.group}</span>
            </div>
          ))}
        </div>
        <p className="px-1 text-xs text-text-muted">↑ ↓ to move · Enter to go · Esc to close</p>
      </div>
    </div>
  );
}
