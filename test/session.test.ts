import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MurmurSession } from '../src/core/session.js';
import type { Broadcaster } from '../src/core/session.js';
import { UNDO_TRANSCRIPT, SHUTDOWN_TRANSCRIPT } from '../src/types.js';

function mockBroadcaster(): Broadcaster & { broadcast: ReturnType<typeof vi.fn>; sendReload: ReturnType<typeof vi.fn> } {
  return {
    broadcast: vi.fn(),
    sendReload: vi.fn(),
  };
}

function cmd(transcript: string, html = '<div>page</div>') {
  return { transcript, html };
}

describe('MurmurSession', () => {
  let session: MurmurSession;

  beforeEach(() => {
    session = new MurmurSession();
  });

  describe('lifecycle', () => {
    it('starts as not running', () => {
      expect(session.running).toBe(false);
      expect(session.port).toBeNull();
      expect(session.broadcaster).toBeNull();
    });

    it('transitions to running on start', () => {
      const bc = mockBroadcaster();
      session.start(4444, bc);
      expect(session.running).toBe(true);
      expect(session.port).toBe(4444);
      expect(session.broadcaster).toBe(bc);
    });

    it('throws when starting an already-running session', () => {
      session.start(4444, mockBroadcaster());
      expect(() => session.start(5555, mockBroadcaster())).toThrow('Session already running');
    });

    it('transitions to not running on stop', () => {
      session.start(4444, mockBroadcaster());
      session.stop();
      expect(session.running).toBe(false);
      expect(session.port).toBeNull();
      expect(session.broadcaster).toBeNull();
    });

    it('can restart after stop', () => {
      const bc = mockBroadcaster();
      session.start(4444, bc);
      session.stop();
      session.start(5555, bc);
      expect(session.running).toBe(true);
      expect(session.port).toBe(5555);
    });
  });

  describe('getStatus', () => {
    it('returns idle status when not running', () => {
      expect(session.getStatus()).toEqual({
        running: false,
        port: null,
        pendingCommands: 0,
        hasWaitingConsumer: false,
      });
    });

    it('reflects running state and queue depth', () => {
      session.start(4444, mockBroadcaster());
      session.commands.enqueue(cmd('hello'));
      session.commands.enqueue(cmd('world'));

      const status = session.getStatus();
      expect(status.running).toBe(true);
      expect(status.port).toBe(4444);
      expect(status.pendingCommands).toBe(2);
    });
  });

  describe('getCommand', () => {
    it('returns command result with transcript and html', async () => {
      session.start(4444, mockBroadcaster());
      session.commands.enqueue(cmd('make it blue', '<h1>Hello</h1>'));

      const result = await session.getCommand();
      expect(result).toEqual({
        type: 'command',
        transcript: 'make it blue',
        html: '<h1>Hello</h1>',
      });
    });

    it('returns undo result for UNDO_TRANSCRIPT', async () => {
      session.start(4444, mockBroadcaster());
      session.commands.enqueue({ transcript: UNDO_TRANSCRIPT, html: '' });

      const result = await session.getCommand();
      expect(result).toEqual({ type: 'undo' });
    });

    it('returns shutdown result for SHUTDOWN_TRANSCRIPT', async () => {
      session.start(4444, mockBroadcaster());
      session.commands.enqueue({ transcript: SHUTDOWN_TRANSCRIPT, html: '' });

      const result = await session.getCommand();
      expect(result).toEqual({ type: 'shutdown' });
    });

    it('broadcasts processing status for normal commands', async () => {
      const bc = mockBroadcaster();
      session.start(4444, bc);
      session.commands.enqueue(cmd('change header'));

      await session.getCommand();
      expect(bc.broadcast).toHaveBeenCalledWith({
        type: 'status',
        state: 'processing',
        transcript: 'change header',
      });
    });

    it('does NOT broadcast processing for undo', async () => {
      const bc = mockBroadcaster();
      session.start(4444, bc);
      session.commands.enqueue({ transcript: UNDO_TRANSCRIPT, html: '' });

      await session.getCommand();
      expect(bc.broadcast).not.toHaveBeenCalled();
    });

    it('truncates html beyond maxHtmlLength', async () => {
      session.start(4444, mockBroadcaster());
      const longHtml = 'x'.repeat(100);
      session.commands.enqueue(cmd('test', longHtml));

      const result = await session.getCommand(50);
      expect(result.type).toBe('command');
      if (result.type === 'command') {
        expect(result.html.length).toBeLessThan(100);
        expect(result.html).toContain('<!-- truncated -->');
      }
    });

    it('blocks until command arrives', async () => {
      session.start(4444, mockBroadcaster());

      let resolved = false;
      const promise = session.getCommand();
      promise.then(() => { resolved = true; });

      await Promise.resolve();
      expect(resolved).toBe(false);

      session.commands.enqueue(cmd('finally'));
      const result = await promise;
      expect(result.type).toBe('command');
    });
  });

  describe('readCommand', () => {
    it('returns null when queue is empty', () => {
      session.start(4444, mockBroadcaster());
      expect(session.readCommand()).toBeNull();
    });

    it('returns command when available', () => {
      session.start(4444, mockBroadcaster());
      session.commands.enqueue(cmd('hello'));

      const result = session.readCommand();
      expect(result).toEqual({
        type: 'command',
        transcript: 'hello',
        html: '<div>page</div>',
      });
    });

    it('returns undo for UNDO_TRANSCRIPT', () => {
      session.start(4444, mockBroadcaster());
      session.commands.enqueue({ transcript: UNDO_TRANSCRIPT, html: '' });
      expect(session.readCommand()).toEqual({ type: 'undo' });
    });

    it('broadcasts processing for normal commands', () => {
      const bc = mockBroadcaster();
      session.start(4444, bc);
      session.commands.enqueue(cmd('change color'));

      session.readCommand();
      expect(bc.broadcast).toHaveBeenCalledWith({
        type: 'status',
        state: 'processing',
        transcript: 'change color',
      });
    });
  });

  describe('sendStatus', () => {
    it('broadcasts applied status with summary', () => {
      const bc = mockBroadcaster();
      session.start(4444, bc);

      session.sendStatus('applied', 'Changed header to blue');
      expect(bc.broadcast).toHaveBeenCalledWith({
        type: 'status',
        state: 'applied',
        summary: 'Changed header to blue',
      });
    });

    it('broadcasts error status with message', () => {
      const bc = mockBroadcaster();
      session.start(4444, bc);

      session.sendStatus('error', 'File not found');
      expect(bc.broadcast).toHaveBeenCalledWith({
        type: 'status',
        state: 'error',
        message: 'File not found',
      });
    });

    it('broadcasts processing status with transcript', () => {
      const bc = mockBroadcaster();
      session.start(4444, bc);

      session.sendStatus('processing', 'Thinking...');
      expect(bc.broadcast).toHaveBeenCalledWith({
        type: 'status',
        state: 'processing',
        transcript: 'Thinking...',
      });
    });

    it('no-ops when broadcaster is null', () => {
      session.sendStatus('applied', 'no crash');
    });
  });

  describe('reload', () => {
    it('delegates to broadcaster.sendReload', () => {
      const bc = mockBroadcaster();
      session.start(4444, bc);

      session.reload();
      expect(bc.sendReload).toHaveBeenCalledOnce();
    });

    it('no-ops when broadcaster is null', () => {
      session.reload();
    });
  });

  describe('stop with pending waiter', () => {
    it('resolves pending getCommand with shutdown', async () => {
      session.start(4444, mockBroadcaster());

      const promise = session.getCommand();
      session.stop();

      const result = await promise;
      expect(result).toEqual({ type: 'shutdown' });
    });

    it('drains remaining commands', () => {
      session.start(4444, mockBroadcaster());
      session.commands.enqueue(cmd('a'));
      session.commands.enqueue(cmd('b'));

      session.stop();
      expect(session.commands.pendingCount).toBe(0);
    });
  });
});
