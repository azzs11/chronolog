import { io, type Socket } from 'socket.io-client';
import { WS_URL } from '../env';

type Handler = (...args: never[]) => void;

const RECONNECTION_DELAY_MS = 1000;
const RECONNECTION_ATTEMPTS = 10;

class SocketService {
  private socket: Socket | null = null;
  private isConnected = false;

  connect(url: string = WS_URL): Socket {
    if (this.socket?.connected) return this.socket;

    this.socket = io(url, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: RECONNECTION_DELAY_MS,
      reconnectionAttempts: RECONNECTION_ATTEMPTS,
    });

    this.socket.on('connect', () => {
      this.isConnected = true;
    });
    this.socket.on('disconnect', () => {
      this.isConnected = false;
    });
    this.socket.on('connect_error', (err: Error) => console.warn('WS error:', err.message));

    return this.socket;
  }

  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      this.isConnected = false;
    }
  }

  on(event: string, cb: Handler): void {
    this.socket?.on(event, cb as (...args: unknown[]) => void);
  }

  off(event: string, cb: Handler): void {
    this.socket?.off(event, cb as (...args: unknown[]) => void);
  }

  onNewLog(cb: Handler): void { this.on('new-log', cb); }
  onStatsUpdate(cb: Handler): void { this.on('log-stats', cb); }
  onConnectionSuccess(cb: Handler): void { this.on('connection-success', cb); }
  onCausalEvent(cb: Handler): void { this.on('causal-event', cb); }

  sendLog(logData: unknown): void {
    if (this.socket?.connected) this.socket.emit('send-log', logData);
  }

  getConnectionStatus(): boolean {
    return this.isConnected;
  }

  removeAllListeners(): void {
    this.socket?.removeAllListeners();
  }
}

const socketService = new SocketService();
export default socketService;
