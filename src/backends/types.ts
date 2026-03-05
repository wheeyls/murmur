export interface CommandResult {
  success: boolean;
  summary: string;
  error?: string;
  filesChanged?: string[];
}

export interface Backend {
  processCommand(command: string, pageHtml: string): Promise<CommandResult>;
  undo(): Promise<CommandResult>;
  type: string;
}
