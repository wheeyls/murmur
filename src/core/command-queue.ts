import type { VoiceCommand } from '../types.js';

export class CommandQueue {
  private queue: VoiceCommand[] = [];
  private resolver: ((cmd: VoiceCommand) => void) | null = null;

  onCommandAvailable: (() => void) | null = null;

  enqueue(cmd: VoiceCommand): void {
    if (this.resolver) {
      const resolve = this.resolver;
      this.resolver = null;
      resolve(cmd);
    } else {
      this.queue.push(cmd);
    }
    this.onCommandAvailable?.();
  }

  waitForNext(): Promise<VoiceCommand> {
    const next = this.queue.shift();
    if (next) return Promise.resolve(next);
    return new Promise((resolve) => {
      this.resolver = resolve;
    });
  }

  tryRead(): VoiceCommand | null {
    return this.queue.shift() ?? null;
  }

  get pending(): readonly VoiceCommand[] {
    return this.queue;
  }

  get pendingCount(): number {
    return this.queue.length;
  }

  get hasWaitingConsumer(): boolean {
    return this.resolver !== null;
  }

  drain(): void {
    this.queue.length = 0;
    this.resolver = null;
  }
}
