/** Commands for the "Ask Tock" palette, and how a query picks them. Pure, so it is easy to test. */

export interface Command {
  id: string;
  label: string;
  group: string;
  /** Extra words that should find this command. */
  keywords?: string;
  run: () => void;
}

/** Every word of the query must appear in the label or keywords; labels that start with the query rank first. */
export function filterCommands(commands: readonly Command[], query: string): Command[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [...commands];
  const q = words.join(' ');
  return commands
    .filter((c) => {
      const text = `${c.label} ${c.keywords ?? ''} ${c.group}`.toLowerCase();
      return words.every((w) => text.includes(w));
    })
    .map((c, i) => ({ c, i, starts: c.label.toLowerCase().startsWith(q) ? 0 : 1 }))
    .sort((a, b) => a.starts - b.starts || a.i - b.i)
    .map(({ c }) => c);
}

/** True for Cmd+K on a Mac and Ctrl+K elsewhere. */
export const isPaletteShortcut = (e: { key: string; metaKey: boolean; ctrlKey: boolean }): boolean => e.key.toLowerCase() === 'k' && (e.metaKey || e.ctrlKey);
