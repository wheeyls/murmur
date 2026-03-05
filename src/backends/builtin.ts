import type { Backend, CommandResult } from './types.js';
import type { MurmurConfig, FileSnapshot } from '../types.js';
import { AI } from '../ai.js';
import { gatherContext } from '../context.js';
import { parseEdits, applyEdits, undoEdits } from '../editor.js';

export class BuiltinBackend implements Backend {
  type = 'builtin' as const;
  private ai: AI;
  private config: MurmurConfig;
  private undoStack: FileSnapshot[][] = [];

  constructor(config: MurmurConfig) {
    this.config = config;
    this.ai = new AI(config);
  }

  async processCommand(command: string, pageHtml: string): Promise<CommandResult> {
    const files = await gatherContext(this.config.projectRoot);

    const response = await this.ai.processCommand(command, files, pageHtml);
    const { edits, summary } = parseEdits(response);

    if (edits.length === 0) {
      return { success: false, summary: '', error: 'No edits generated. Try rephrasing your request.' };
    }

    const result = await applyEdits(edits, this.config.projectRoot);
    this.undoStack.push(result.snapshots);

    if (result.failed.length > 0 && result.applied === 0) {
      return {
        success: false,
        summary: '',
        error: `All edits failed: ${result.failed.join('; ')}`,
      };
    }

    const filesChanged = edits.map((e) => e.path);
    return {
      success: true,
      summary: summary || `Applied ${result.applied} edit${result.applied !== 1 ? 's' : ''}`,
      filesChanged,
    };
  }

  async undo(): Promise<CommandResult> {
    const snapshots = this.undoStack.pop();
    if (!snapshots) {
      return { success: false, summary: '', error: 'Nothing to undo' };
    }
    await undoEdits(snapshots, this.config.projectRoot);
    return { success: true, summary: 'Reverted last change' };
  }
}
