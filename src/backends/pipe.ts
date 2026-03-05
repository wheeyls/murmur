import fs from 'node:fs/promises';
import path from 'node:path';
import type { Backend, CommandResult } from './types.js';

const INBOX_DIR = '.murmur/inbox';
const OUTBOX_DIR = '.murmur/outbox';
const POLL_INTERVAL = 500;
const DEFAULT_TIMEOUT = 120_000;

interface PipeCommand {
  id: string;
  command: string;
  html: string;
  timestamp: number;
}

interface PipeResult {
  id: string;
  success: boolean;
  summary: string;
  error?: string;
}

export class PipeBackend implements Backend {
  type = 'pipe' as const;
  private projectRoot: string;
  private timeout: number;

  constructor(projectRoot: string, timeout?: number) {
    this.projectRoot = projectRoot;
    this.timeout = timeout || DEFAULT_TIMEOUT;
  }

  async processCommand(command: string, pageHtml: string): Promise<CommandResult> {
    const inboxDir = path.join(this.projectRoot, INBOX_DIR);
    const outboxDir = path.join(this.projectRoot, OUTBOX_DIR);
    await fs.mkdir(inboxDir, { recursive: true });
    await fs.mkdir(outboxDir, { recursive: true });

    const id = `cmd_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    const msg: PipeCommand = {
      id,
      command,
      html: pageHtml.length > 50_000 ? pageHtml.slice(0, 50_000) : pageHtml,
      timestamp: Date.now(),
    };

    const inboxPath = path.join(inboxDir, `${id}.json`);
    await fs.writeFile(inboxPath, JSON.stringify(msg, null, 2));

    const outboxPath = path.join(outboxDir, `${id}.json`);
    const result = await this.pollForResult(outboxPath);

    try { await fs.unlink(inboxPath); } catch {}
    try { await fs.unlink(outboxPath); } catch {}

    return result;
  }

  private async pollForResult(outboxPath: string): Promise<CommandResult> {
    const deadline = Date.now() + this.timeout;

    while (Date.now() < deadline) {
      try {
        const content = await fs.readFile(outboxPath, 'utf-8');
        const result: PipeResult = JSON.parse(content);
        return {
          success: result.success,
          summary: result.summary || 'Changes applied',
          error: result.error,
        };
      } catch {
        await sleep(POLL_INTERVAL);
      }
    }

    return { success: false, summary: '', error: `Timed out after ${this.timeout / 1000}s waiting for response. Is the processor running?` };
  }

  async undo(): Promise<CommandResult> {
    return this.processCommand('Undo the last change you made. Revert the files.', '');
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
