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
