import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { Backend, CommandResult } from './types.js';

const exec = promisify(execFile);

const SYSTEM_CONTEXT = `You are editing a live web application based on a voice command from the user.
The user is looking at the app in their browser and describing changes they want.
Make the changes directly to the source files. Be minimal and targeted.
After editing, briefly state what you changed.`;

export class ClaudeCodeBackend implements Backend {
  type = 'claude-code' as const;
  private projectRoot: string;
  private sessionId: string | null = null;
  private model: string | undefined;

  constructor(projectRoot: string, model?: string) {
    this.projectRoot = projectRoot;
    this.model = model;
  }

  async processCommand(command: string, pageHtml: string): Promise<CommandResult> {
    const claudeBin = await findBinary('claude');
    if (!claudeBin) {
      return { success: false, summary: '', error: 'claude CLI not found. Install: npm i -g @anthropic-ai/claude-code' };
    }

    const htmlContext = pageHtml.length > 30_000
      ? pageHtml.slice(0, 30_000) + '\n<!-- truncated -->'
      : pageHtml;

    const prompt = [
      SYSTEM_CONTEXT,
      '',
      '## Current Page HTML (what the user sees)',
      htmlContext,
      '',
      `## Voice Command`,
      `"${command}"`,
    ].join('\n');

    const args = ['-p', prompt, '--output-format', 'json'];

    if (this.sessionId) {
      args.push('--resume', '--session-id', this.sessionId);
    }

    if (this.model) {
      args.push('--model', this.model);
    }

    try {
      const { stdout } = await exec(claudeBin, args, {
        cwd: this.projectRoot,
        timeout: 120_000,
        maxBuffer: 10 * 1024 * 1024,
        env: { ...process.env },
      });

      return this.parseClaudeOutput(stdout);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, summary: '', error: `Claude Code error: ${message}` };
    }
  }

  private parseClaudeOutput(stdout: string): CommandResult {
    try {
      const lines = stdout.trim().split('\n');
      for (const line of lines) {
        try {
          const parsed = JSON.parse(line);

          if (parsed.session_id && !this.sessionId) {
            this.sessionId = parsed.session_id;
          }

          if (parsed.type === 'result' || parsed.result) {
            const text = parsed.result || parsed.text || parsed.content || '';
            return { success: true, summary: extractSummary(text) };
          }
        } catch {
          continue;
        }
      }

      const lastLine = lines[lines.length - 1];
      try {
        const parsed = JSON.parse(lastLine);
        if (parsed.session_id) this.sessionId = parsed.session_id;
        const text = parsed.result || parsed.text || parsed.content || JSON.stringify(parsed);
        return { success: true, summary: extractSummary(text) };
      } catch {
        return { success: true, summary: extractSummary(stdout) };
      }
    } catch {
      return { success: true, summary: 'Changes applied' };
    }
  }

  async undo(): Promise<CommandResult> {
    if (!this.sessionId) {
      return { success: false, summary: '', error: 'No session to undo in' };
    }

    const claudeBin = await findBinary('claude');
    if (!claudeBin) {
      return { success: false, summary: '', error: 'claude CLI not found' };
    }

    try {
      await exec(claudeBin, [
        '-p', 'Undo the last change you made. Revert the files.',
        '--resume', '--session-id', this.sessionId,
        '--output-format', 'json',
      ], {
        cwd: this.projectRoot,
        timeout: 60_000,
        env: { ...process.env },
      });
      return { success: true, summary: 'Reverted last change' };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, summary: '', error: message };
    }
  }
}

export class OpenCodeBackend implements Backend {
  type = 'opencode' as const;
  private projectRoot: string;
  private sessionId: string | null = null;
  private model: string | undefined;

  constructor(projectRoot: string, model?: string) {
    this.projectRoot = projectRoot;
    this.model = model;
  }

  async processCommand(command: string, pageHtml: string): Promise<CommandResult> {
    const binary = await findBinary('opencode');
    if (!binary) {
      return { success: false, summary: '', error: 'opencode CLI not found. Install: curl -fsSL https://opencode.ai/install | bash' };
    }

    const htmlContext = pageHtml.length > 30_000
      ? pageHtml.slice(0, 30_000) + '\n<!-- truncated -->'
      : pageHtml;

    const prompt = [
      `Edit this web application based on the user's voice command.`,
      `The user is viewing the page and said: "${command}"`,
      '',
      'Current page HTML:',
      htmlContext,
      '',
      'Make targeted edits to the source files. State briefly what you changed.',
    ].join('\n');

    const args = ['run', '--format', 'json'];

    if (this.sessionId) {
      args.push('--session', this.sessionId);
    } else {
      args.push('--title', `murmur-${Date.now()}`);
      args.push('--dir', this.projectRoot);
    }

    if (this.model) {
      args.push('--model', this.model);
    }

    args.push(prompt);

    try {
      const { stdout } = await exec(binary, args, {
        cwd: this.projectRoot,
        timeout: 120_000,
        maxBuffer: 10 * 1024 * 1024,
        env: { ...process.env },
      });

      return this.parseOpenCodeOutput(stdout);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, summary: '', error: `OpenCode error: ${message}` };
    }
  }

  private parseOpenCodeOutput(stdout: string): CommandResult {
    try {
      const lines = stdout.trim().split('\n').filter(Boolean);
      for (const line of lines) {
        try {
          const parsed = JSON.parse(line);
          if (parsed.sessionId || parsed.session_id) {
            this.sessionId = parsed.sessionId || parsed.session_id;
          }
          if (parsed.type === 'text' || parsed.type === 'result') {
            return { success: true, summary: extractSummary(parsed.content || parsed.text || '') };
          }
        } catch {
          continue;
        }
      }
      return { success: true, summary: extractSummary(stdout) };
    } catch {
      return { success: true, summary: 'Changes applied' };
    }
  }

  async undo(): Promise<CommandResult> {
    if (!this.sessionId) {
      return { success: false, summary: '', error: 'No session to undo in' };
    }

    const binary = await findBinary('opencode');
    if (!binary) {
      return { success: false, summary: '', error: 'opencode CLI not found' };
    }

    try {
      await exec(binary, [
        'run', '--session', this.sessionId, '--format', 'json',
        'Undo the last change you made. Revert the files to their previous state.',
      ], {
        cwd: this.projectRoot,
        timeout: 60_000,
        env: { ...process.env },
      });
      return { success: true, summary: 'Reverted last change' };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, summary: '', error: message };
    }
  }
}

async function findBinary(name: string): Promise<string | null> {
  try {
    const { stdout } = await exec('which', [name]);
    return stdout.trim() || null;
  } catch {
    return null;
  }
}

function extractSummary(text: string): string {
  if (!text) return 'Changes applied';
  const lines = text.split('\n').filter(Boolean);
  const summaryLine = lines.find((l) => l.length > 5 && l.length < 200 && !l.startsWith('{') && !l.startsWith('['));
  return summaryLine?.slice(0, 150) || 'Changes applied';
}
