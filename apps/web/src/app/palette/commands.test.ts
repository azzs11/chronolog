import { type Command, filterCommands, isPaletteShortcut } from './commands';

const cmd = (id: string, label: string, keywords = ''): Command => ({ id, label, group: 'Go to', keywords, run: () => undefined });
const all = [cmd('a', 'Live'), cmd('b', 'Playground'), cmd('c', 'Daily case', 'puzzle game'), cmd('d', 'Dark theme', 'night')];

describe('filterCommands', () => {
  it('keeps everything for an empty query', () => {
    expect(filterCommands(all, '  ')).toHaveLength(4);
  });

  it('matches words in labels and keywords, every word required', () => {
    expect(filterCommands(all, 'night').map((c) => c.id)).toEqual(['d']);
    expect(filterCommands(all, 'puzzle game').map((c) => c.id)).toEqual(['c']);
    expect(filterCommands(all, 'puzzle live')).toEqual([]);
  });

  it('ranks labels that start with the query first', () => {
    expect(filterCommands([cmd('x', 'Replay a real incident'), cmd('y', 'Real incidents')], 'real').map((c) => c.id)).toEqual(['y', 'x']);
  });
});

describe('isPaletteShortcut', () => {
  it('is Cmd+K or Ctrl+K only', () => {
    expect(isPaletteShortcut({ key: 'k', metaKey: true, ctrlKey: false })).toBe(true);
    expect(isPaletteShortcut({ key: 'K', metaKey: false, ctrlKey: true })).toBe(true);
    expect(isPaletteShortcut({ key: 'k', metaKey: false, ctrlKey: false })).toBe(false);
  });
});
