export interface FileEdit {
  path: string;
  type: 'modify' | 'create' | 'delete';
  search?: string;
  replace?: string;
  content?: string;
}

export interface EditResult {
  edits: FileEdit[];
  summary: string;
}

export interface ApplyResult {
  applied: number;
  failed: string[];
  snapshots: FileSnapshot[];
}

export interface FileSnapshot {
  path: string;
  content: string | null; // null = file didn't exist
}

export interface VoiceCommand {
  transcript: string;
  html: string;
}

export const UNDO_TRANSCRIPT = '__UNDO__';
export const SHUTDOWN_TRANSCRIPT = '__SHUTDOWN__';

export function isUndo(cmd: VoiceCommand): boolean {
  return cmd.transcript === UNDO_TRANSCRIPT;
}

export function isShutdown(cmd: VoiceCommand): boolean {
  return cmd.transcript === SHUTDOWN_TRANSCRIPT;
}

export function truncateHtml(html: string, maxLength = 60_000): string {
  if (html.length <= maxLength) return html;
  return html.slice(0, maxLength) + '\n<!-- truncated -->';
}

export interface MurmurConfig {
  target: string;
  port: number;
  provider: 'anthropic' | 'openai';
  model?: string;
  projectRoot: string;
}

export interface WSMessage {
  type: string;
  [key: string]: unknown;
}

export interface WSCommandMessage extends WSMessage {
  type: 'command';
  transcript: string;
  html: string;
}

export interface WSStatusMessage extends WSMessage {
  type: 'status';
  state: 'listening' | 'processing' | 'applied' | 'error';
  message?: string;
  summary?: string;
}

export interface WSUndoMessage extends WSMessage {
  type: 'undo';
}
