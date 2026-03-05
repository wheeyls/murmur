import fs from 'node:fs/promises';
import path from 'node:path';
import type { FileEdit, EditResult, ApplyResult, FileSnapshot } from './types.js';

/**
 * Parse the AI response into structured file edits.
 */
export function parseEdits(response: string): EditResult {
  const edits: FileEdit[] = [];
  let summary = '';

  // Extract summary (can appear anywhere in the response)
  const summaryMatch = response.match(/SUMMARY:\s*(.+)/);
  if (summaryMatch) {
    summary = summaryMatch[1].trim();
  }

  const lines = response.split('\n');
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Look for ---FILE: marker
    if (line.startsWith('---FILE:')) {
      const filePath = line.substring('---FILE:'.length).trim();
      i++;

      if (i >= lines.length) break;

      if (lines[i] === '---SEARCH') {
        // Modification block
        i++;
        const searchLines: string[] = [];
        while (i < lines.length && lines[i] !== '---REPLACE') {
          searchLines.push(lines[i]);
          i++;
        }
        i++; // skip ---REPLACE
        const replaceLines: string[] = [];
        while (i < lines.length && lines[i] !== '---END') {
          replaceLines.push(lines[i]);
          i++;
        }
        i++; // skip ---END

        edits.push({
          path: filePath,
          type: 'modify',
          search: searchLines.join('\n'),
          replace: replaceLines.join('\n'),
        });
      } else if (lines[i] === '---CREATE') {
        // Creation block
        i++;
        const contentLines: string[] = [];
        while (i < lines.length && lines[i] !== '---END') {
          contentLines.push(lines[i]);
          i++;
        }
        i++; // skip ---END

        edits.push({
          path: filePath,
          type: 'create',
          content: contentLines.join('\n'),
        });
      } else if (lines[i] === '---DELETE') {
        i++;
        if (i < lines.length && lines[i] === '---END') i++;

        edits.push({
          path: filePath,
          type: 'delete',
        });
      } else {
        i++;
      }
      continue;
    }

    i++;
  }

  return { edits, summary };
}

/**
 * Apply parsed edits to disk. Takes a snapshot first for undo.
 */
export async function applyEdits(
  edits: FileEdit[],
  projectRoot: string,
): Promise<ApplyResult> {
  let applied = 0;
  const failed: string[] = [];
  const snapshots: FileSnapshot[] = [];

  for (const edit of edits) {
    const fullPath = path.resolve(projectRoot, edit.path);

    // Security: prevent path traversal
    if (!fullPath.startsWith(path.resolve(projectRoot))) {
      failed.push(`${edit.path}: path traversal blocked`);
      continue;
    }

    try {
      switch (edit.type) {
        case 'modify': {
          const content = await fs.readFile(fullPath, 'utf-8');
          snapshots.push({ path: edit.path, content });

          const newContent = findAndReplace(content, edit.search!, edit.replace!);
          if (newContent !== null) {
            await fs.writeFile(fullPath, newContent, 'utf-8');
            applied++;
          } else {
            failed.push(`${edit.path}: SEARCH block not found in file`);
          }
          break;
        }
        case 'create': {
          // Snapshot: record that file didn't exist
          try {
            const existing = await fs.readFile(fullPath, 'utf-8');
            snapshots.push({ path: edit.path, content: existing });
          } catch {
            snapshots.push({ path: edit.path, content: null });
          }

          await fs.mkdir(path.dirname(fullPath), { recursive: true });
          await fs.writeFile(fullPath, edit.content!, 'utf-8');
          applied++;
          break;
        }
        case 'delete': {
          try {
            const existing = await fs.readFile(fullPath, 'utf-8');
            snapshots.push({ path: edit.path, content: existing });
            await fs.unlink(fullPath);
            applied++;
          } catch {
            failed.push(`${edit.path}: file not found for deletion`);
          }
          break;
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      failed.push(`${edit.path}: ${msg}`);
    }
  }

  return { applied, failed, snapshots };
}

/**
 * Undo by restoring file snapshots.
 */
export async function undoEdits(
  snapshots: FileSnapshot[],
  projectRoot: string,
): Promise<void> {
  for (const snap of snapshots) {
    const fullPath = path.resolve(projectRoot, snap.path);
    if (snap.content === null) {
      // File was created by the edit — delete it
      try {
        await fs.unlink(fullPath);
      } catch {
        // Already gone, fine
      }
    } else {
      // Restore original content
      await fs.writeFile(fullPath, snap.content, 'utf-8');
    }
  }
}

/**
 * Find and replace with fallback strategies.
 */
function findAndReplace(
  content: string,
  search: string,
  replace: string,
): string | null {
  // Strategy 1: exact match
  if (content.includes(search)) {
    return content.replace(search, replace);
  }

  // Strategy 2: normalize line endings
  const normContent = content.replace(/\r\n/g, '\n');
  const normSearch = search.replace(/\r\n/g, '\n');
  const normReplace = replace.replace(/\r\n/g, '\n');
  if (normContent.includes(normSearch)) {
    return normContent.replace(normSearch, normReplace);
  }

  // Strategy 3: trim trailing whitespace per line
  const trimmedContent = normContent.split('\n').map(l => l.trimEnd()).join('\n');
  const trimmedSearch = normSearch.split('\n').map(l => l.trimEnd()).join('\n');
  if (trimmedContent.includes(trimmedSearch)) {
    // We need to apply the replacement to the original content.
    // Find the matching region in the trimmed version and map back.
    // Simpler approach: just apply to trimmed content and return that.
    return trimmedContent.replace(trimmedSearch, normReplace);
  }

  return null;
}
