/**
 * Stands in for services/socketService.ts in the demo build (vite.config.ts swaps the module), so the
 * demo does not ship socket.io. It "receives" each simulated line when the clock reaches it.
 */
import type { RcaLine } from '@chronolog/engine';
import { demoBackend } from './instance';

type Handler = (...args: never[]) => void;
const TICK_MS = 1000;

const toRaw = (l: RcaLine) => ({ id: l.id, message: l.message, severity: l.severity ?? 'info', source: l.service, timestamp: new Date(l.timestamp * 1000).toISOString() });

class DemoSocket {
  private timer: ReturnType<typeof setInterval> | null = null;
  private sentUntil = 0;
  private readonly handlers = new Map<string, Set<Handler>>();
  private readonly connectionListeners = new Set<(connected: boolean) => void>();

  connect(): void {
    if (this.timer) return;
    this.sentUntil = Math.floor(Date.now() / 1000);
    this.timer = setInterval(() => this.tick(), TICK_MS);
    for (const listener of this.connectionListeners) listener(true);
  }

  private tick(): void {
    const now = Math.floor(Date.now() / 1000);
    if (now <= this.sentUntil) return;
    const lines = demoBackend.world.linesBetween(this.sentUntil + 1, now, now);
    this.sentUntil = now;
    const listeners = this.handlers.get('new-log');
    if (!listeners) return;
    for (const line of lines) for (const cb of listeners) (cb as (log: ReturnType<typeof toRaw>) => void)(toRaw(line));
  }

  onConnectionChange(listener: (connected: boolean) => void): () => void {
    this.connectionListeners.add(listener);
    listener(this.timer !== null);
    return () => {
      this.connectionListeners.delete(listener);
    };
  }

  disconnect(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    for (const listener of this.connectionListeners) listener(false);
  }

  on(event: string, cb: Handler): void {
    const set = this.handlers.get(event) ?? new Set<Handler>();
    set.add(cb);
    this.handlers.set(event, set);
  }

  off(event: string, cb: Handler): void {
    this.handlers.get(event)?.delete(cb);
  }

  onNewLog(cb: Handler): void { this.on('new-log', cb); }
  onStatsUpdate(cb: Handler): void { this.on('log-stats', cb); }
  onConnectionSuccess(cb: Handler): void { this.on('connection-success', cb); }
  onCausalEvent(cb: Handler): void { this.on('causal-event', cb); }
  sendLog(): void {}
  getConnectionStatus(): boolean { return this.timer !== null; }
  removeAllListeners(): void { this.handlers.clear(); }
}

const socketService = new DemoSocket();
export default socketService;
