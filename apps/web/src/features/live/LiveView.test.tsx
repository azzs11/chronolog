import { act, fireEvent, render, screen, within } from '@testing-library/react';
import axios from 'axios';
import { vi } from 'vitest';

type LogHandler = (log: unknown) => void;
const socket = vi.hoisted(() => ({
  logHandler: null as null | ((log: unknown) => void),
  connectionHandler: null as null | ((connected: boolean) => void),
}));

vi.mock('axios', () => ({ default: { get: vi.fn() } }));
vi.mock('../../services/socketService', () => ({
  default: {
    connect: vi.fn(),
    off: vi.fn(),
    onNewLog: (cb: LogHandler) => {
      socket.logHandler = cb;
    },
    onConnectionChange: (cb: (c: boolean) => void) => {
      socket.connectionHandler = cb;
      cb(true);
      return () => undefined;
    },
  },
}));

import LiveView from './LiveView';

const TIME = new Date().toISOString();
const raw = (id: string, message: string, severity = 'info', source = 'api') => ({ id, message, severity, source, timestamp: TIME });
const initial = [raw('a', 'user 1 logged in'), raw('b', 'user 2 logged in'), raw('c', 'database connection refused', 'error', 'db')];

/** The rows of the templates list. */
const templateRows = (): HTMLElement[] => within(screen.getByRole('list', { name: 'Message templates' })).getAllByRole('listitem');
const selectedRows = (): HTMLElement[] => templateRows().filter((row) => row.querySelector('[aria-current="true"]'));

async function renderLive(logs: unknown[] = initial) {
  vi.mocked(axios.get).mockResolvedValue({ data: { data: logs } });
  render(<LiveView />);
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 450)); // the view batches updates every 400 ms
  });
}

describe('LiveView', () => {
  it('groups lines by template, with counts and one stats strip, and nothing blinking while live', async () => {
    await renderLive();
    const rows = templateRows();
    expect(rows).toHaveLength(2);
    expect(within(rows[0] as HTMLElement).getByText(/2×|1×/)).toBeInTheDocument();
    expect(screen.getAllByRole('status')[0]).toHaveTextContent('');
    expect(document.querySelector('[class*="animate-pulse"]')).toBeNull();
    expect(screen.getByLabelText('Stream statistics')).toHaveTextContent('Lines');
  });

  it('shows the severity as a named pill, never only as colour', async () => {
    await renderLive();
    expect(screen.getByText('error', { selector: 'span.chip' })).toBeInTheDocument();
  });

  it('opens a template in the detail pane, and shows examples and services', async () => {
    await renderLive();
    fireEvent.click(templateRows()[0]?.querySelector('button') as HTMLElement);
    const detail = screen.getByRole('region', { name: 'Template details' });
    expect(within(detail).getByText(/lines\. First seen/)).toBeInTheDocument();
    expect(within(detail).getByRole('region', { name: 'Recent examples' })).toBeInTheDocument();
  });

  it('moves through the list with j and k', async () => {
    await renderLive();
    const list = screen.getByRole('list', { name: 'Message templates' });
    fireEvent.keyDown(list, { key: 'j' });
    expect(selectedRows()).toHaveLength(1);
    fireEvent.keyDown(list, { key: 'j' });
    fireEvent.keyDown(list, { key: 'k' });
    expect(selectedRows()).toEqual([templateRows()[0]]);
  });

  it('adds a line that arrives over the socket, marks a never-seen message as new, and ignores a duplicate id', async () => {
    await renderLive();
    await act(async () => {
      socket.logHandler?.(raw('d', 'cache evicted every key at once', 'warning', 'cache'));
      socket.logHandler?.(raw('d', 'cache evicted every key at once', 'warning', 'cache'));
      await new Promise((resolve) => setTimeout(resolve, 450));
    });
    expect(templateRows()).toHaveLength(3);
    expect(screen.getByText('new')).toBeInTheDocument();
    expect(screen.getByLabelText('Stream statistics')).toHaveTextContent(/Lines\s*4/);
  });

  it('pauses without losing lines, counts what is waiting, and catches up on resume', async () => {
    await renderLive();
    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
    await act(async () => {
      socket.logHandler?.(raw('e', 'another brand new message here'));
      socket.logHandler?.(raw('f', 'yet another distinct message appears'));
      await new Promise((resolve) => setTimeout(resolve, 450));
    });
    expect(screen.getByRole('status')).toHaveTextContent('Paused');
    expect(screen.getByRole('status')).toHaveTextContent('2 waiting');
    expect(templateRows()).toHaveLength(2);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Resume' }));
      await new Promise((resolve) => setTimeout(resolve, 450));
    });
    expect(templateRows()).toHaveLength(4);
  });

  it('shows a disconnected state quietly', async () => {
    await renderLive();
    await act(async () => socket.connectionHandler?.(false));
    expect(screen.getAllByRole('status')[0]).toHaveTextContent(/Disconnected/);
  });

  it('switches to raw lines, newest first, and filters by severity and text', async () => {
    await renderLive();
    fireEvent.click(screen.getByRole('button', { name: 'Raw' }));
    const lines = screen.getByRole('list', { name: 'Raw log lines' });
    expect(within(lines).getAllByRole('listitem')).toHaveLength(3);
    fireEvent.click(screen.getByRole('button', { name: 'error' }));
    expect(within(lines).getAllByRole('listitem')).toHaveLength(1);
    fireEvent.change(screen.getByLabelText('Search messages'), { target: { value: 'nothing matches this' } });
    expect(within(lines).queryAllByRole('listitem')).toHaveLength(0);
  });

  it('teaches what to do when there are no logs, and reports a failed load', async () => {
    vi.mocked(axios.get).mockRejectedValue(new Error('offline'));
    render(<LiveView />);
    expect(await screen.findByText(/No logs yet/)).toBeInTheDocument();
    expect(await screen.findByRole('alert')).toHaveTextContent(/Could not load recent logs: offline/);
  });
});
