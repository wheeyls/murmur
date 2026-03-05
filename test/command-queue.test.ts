import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CommandQueue } from '../src/core/command-queue.js';

function cmd(transcript: string, html = '<html></html>') {
  return { transcript, html };
}

describe('CommandQueue', () => {
  let queue: CommandQueue;

  beforeEach(() => {
    queue = new CommandQueue();
  });

  describe('tryRead', () => {
    it('returns null on empty queue', () => {
      expect(queue.tryRead()).toBeNull();
    });

    it('returns enqueued command', () => {
      queue.enqueue(cmd('hello'));
      expect(queue.tryRead()).toEqual(cmd('hello'));
    });

    it('returns commands in FIFO order', () => {
      queue.enqueue(cmd('first'));
      queue.enqueue(cmd('second'));
      queue.enqueue(cmd('third'));

      expect(queue.tryRead()?.transcript).toBe('first');
      expect(queue.tryRead()?.transcript).toBe('second');
      expect(queue.tryRead()?.transcript).toBe('third');
      expect(queue.tryRead()).toBeNull();
    });
  });

  describe('waitForNext', () => {
    it('resolves immediately when queue has items', async () => {
      queue.enqueue(cmd('already here'));
      const result = await queue.waitForNext();
      expect(result.transcript).toBe('already here');
    });

    it('blocks until enqueue is called', async () => {
      const promise = queue.waitForNext();

      let resolved = false;
      promise.then(() => { resolved = true; });

      await Promise.resolve();
      expect(resolved).toBe(false);

      queue.enqueue(cmd('arrived'));
      const result = await promise;
      expect(result.transcript).toBe('arrived');
    });

    it('delivers directly to waiter without queuing', async () => {
      const promise = queue.waitForNext();
      queue.enqueue(cmd('direct'));

      await promise;
      expect(queue.pendingCount).toBe(0);
    });
  });

  describe('pending / pendingCount', () => {
    it('starts at zero', () => {
      expect(queue.pendingCount).toBe(0);
      expect(queue.pending).toEqual([]);
    });

    it('tracks enqueued items', () => {
      queue.enqueue(cmd('a'));
      queue.enqueue(cmd('b'));
      expect(queue.pendingCount).toBe(2);
      expect(queue.pending).toHaveLength(2);
      expect(queue.pending[0].transcript).toBe('a');
    });

    it('decrements on read', () => {
      queue.enqueue(cmd('a'));
      queue.enqueue(cmd('b'));
      queue.tryRead();
      expect(queue.pendingCount).toBe(1);
    });

    it('stays zero when delivering directly to waiter', async () => {
      const promise = queue.waitForNext();
      queue.enqueue(cmd('direct'));
      await promise;
      expect(queue.pendingCount).toBe(0);
    });
  });

  describe('hasWaitingConsumer', () => {
    it('false initially', () => {
      expect(queue.hasWaitingConsumer).toBe(false);
    });

    it('true after waitForNext on empty queue', () => {
      queue.waitForNext();
      expect(queue.hasWaitingConsumer).toBe(true);
    });

    it('false after waiter is resolved', async () => {
      const promise = queue.waitForNext();
      queue.enqueue(cmd('resolve'));
      await promise;
      expect(queue.hasWaitingConsumer).toBe(false);
    });
  });

  describe('onCommandAvailable', () => {
    it('fires on every enqueue', () => {
      const spy = vi.fn();
      queue.onCommandAvailable = spy;

      queue.enqueue(cmd('one'));
      queue.enqueue(cmd('two'));

      expect(spy).toHaveBeenCalledTimes(2);
    });

    it('fires even when delivering to waiter', async () => {
      const spy = vi.fn();
      queue.onCommandAvailable = spy;

      const promise = queue.waitForNext();
      queue.enqueue(cmd('direct'));
      await promise;

      expect(spy).toHaveBeenCalledTimes(1);
    });

    it('does not fire if callback is null', () => {
      queue.onCommandAvailable = null;
      queue.enqueue(cmd('no crash'));
    });
  });

  describe('drain', () => {
    it('clears all pending commands', () => {
      queue.enqueue(cmd('a'));
      queue.enqueue(cmd('b'));
      queue.drain();
      expect(queue.pendingCount).toBe(0);
      expect(queue.tryRead()).toBeNull();
    });

    it('clears waiting consumer', () => {
      queue.waitForNext();
      expect(queue.hasWaitingConsumer).toBe(true);
      queue.drain();
      expect(queue.hasWaitingConsumer).toBe(false);
    });
  });
});
