import { render, screen } from '@testing-library/react';
import { vi } from 'vitest';

// The app opens a WebSocket and calls the API on mount; neither exists in jsdom.
vi.mock('./services/socketService', () => ({
  default: {
    connect: vi.fn(() => ({ on: vi.fn(), off: vi.fn(), emit: vi.fn(), connected: false })),
    disconnect: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
    onNewLog: vi.fn(),
    onStatsUpdate: vi.fn(),
    onConnectionSuccess: vi.fn(),
    onCausalEvent: vi.fn(),
    sendLog: vi.fn(),
    getConnectionStatus: vi.fn(() => false),
    removeAllListeners: vi.fn(),
  },
}));
vi.mock('axios', () => ({
  default: { get: vi.fn(() => Promise.reject(new Error('offline'))), post: vi.fn(() => Promise.reject(new Error('offline'))) },
}));

import App from './App';

describe('App', () => {
  it('renders the ChronoLog shell without a backend', () => {
    render(<App />);
    expect(screen.getAllByText(/chronolog/i).length).toBeGreaterThan(0);
  });
});
