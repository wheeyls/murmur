import { CommandQueue } from './command-queue.js';
import type { VoiceCommand } from '../types.js';
import { UNDO_TRANSCRIPT, SHUTDOWN_TRANSCRIPT, truncateHtml } from '../types.js';

export interface Broadcaster {
  broadcast(msg: Record<string, unknown>): void;
  sendReload(): void;
}

export interface SessionStatus {
  running: boolean;
  port: number | null;
  pendingCommands: number;
  hasWaitingConsumer: boolean;
}

export type CommandReadResult =
  | { type: 'undo' }
  | { type: 'shutdown' }
  | { type: 'command'; transcript: string; html: string };

export class MurmurSession {
  readonly commands: CommandQueue;
  private _broadcaster: Broadcaster | null = null;
  private _port: number | null = null;
  private _running = false;

  constructor() {
    this.commands = new CommandQueue();
  }

  start(port: number, broadcaster: Broadcaster): void {
    if (this._running) throw new Error('Session already running');
    this._port = port;
    this._broadcaster = broadcaster;
    this._running = true;
  }

  stop(): void {
    if (this.commands.hasWaitingConsumer) {
      this.commands.enqueue({ transcript: SHUTDOWN_TRANSCRIPT, html: '' });
    }
    this.commands.drain();
    this._running = false;
    this._port = null;
    this._broadcaster = null;
  }

  get running(): boolean {
    return this._running;
  }

  get port(): number | null {
    return this._port;
  }

  get broadcaster(): Broadcaster | null {
    return this._broadcaster;
  }

  getStatus(): SessionStatus {
    return {
      running: this._running,
      port: this._port,
      pendingCommands: this.commands.pendingCount,
      hasWaitingConsumer: this.commands.hasWaitingConsumer,
    };
  }

  async getCommand(maxHtmlLength = 60_000): Promise<CommandReadResult> {
    const cmd = await this.commands.waitForNext();
    return this.toResult(cmd, maxHtmlLength);
  }

  readCommand(maxHtmlLength = 60_000): CommandReadResult | null {
    const cmd = this.commands.tryRead();
    if (!cmd) return null;
    return this.toResult(cmd, maxHtmlLength);
  }

  private toResult(cmd: VoiceCommand, maxHtmlLength: number): CommandReadResult {
    if (cmd.transcript === UNDO_TRANSCRIPT) return { type: 'undo' };
    if (cmd.transcript === SHUTDOWN_TRANSCRIPT) return { type: 'shutdown' };

    this._broadcaster?.broadcast({
      type: 'status',
      state: 'processing',
      transcript: cmd.transcript,
    });

    return {
      type: 'command',
      transcript: cmd.transcript,
      html: truncateHtml(cmd.html, maxHtmlLength),
    };
  }

  sendStatus(state: 'processing' | 'applied' | 'error', message: string): void {
    if (!this._broadcaster) return;

    if (state === 'applied') {
      this._broadcaster.broadcast({ type: 'status', state: 'applied', summary: message });
    } else if (state === 'error') {
      this._broadcaster.broadcast({ type: 'status', state: 'error', message });
    } else {
      this._broadcaster.broadcast({ type: 'status', state: 'processing', transcript: message });
    }
  }

  reload(): void {
    this._broadcaster?.sendReload();
  }
}
