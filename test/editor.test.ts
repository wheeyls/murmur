import { describe, it, expect } from 'vitest';
import { parseEdits, findAndReplace } from '../src/editor.js';

describe('parseEdits', () => {
  it('parses a modify block', () => {
    const response = `---FILE: src/App.css
---SEARCH
.header {
  color: red;
}
---REPLACE
.header {
  color: blue;
}
---END

SUMMARY: Changed header color to blue`;

    const { edits, summary } = parseEdits(response);
    expect(edits).toHaveLength(1);
    expect(edits[0]).toEqual({
      path: 'src/App.css',
      type: 'modify',
      search: '.header {\n  color: red;\n}',
      replace: '.header {\n  color: blue;\n}',
    });
    expect(summary).toBe('Changed header color to blue');
  });

  it('parses a create block', () => {
    const response = `---FILE: src/components/Button.tsx
---CREATE
export function Button() {
  return <button>Click</button>;
}
---END

SUMMARY: Created Button component`;

    const { edits, summary } = parseEdits(response);
    expect(edits).toHaveLength(1);
    expect(edits[0]).toEqual({
      path: 'src/components/Button.tsx',
      type: 'create',
      content: 'export function Button() {\n  return <button>Click</button>;\n}',
    });
    expect(summary).toBe('Created Button component');
  });

  it('parses a delete block', () => {
    const response = `---FILE: src/old.ts
---DELETE
---END`;

    const { edits } = parseEdits(response);
    expect(edits).toHaveLength(1);
    expect(edits[0]).toEqual({
      path: 'src/old.ts',
      type: 'delete',
    });
  });

  it('parses multiple edits in one response', () => {
    const response = `---FILE: src/a.ts
---SEARCH
const x = 1;
---REPLACE
const x = 2;
---END

---FILE: src/b.ts
---SEARCH
const y = 1;
---REPLACE
const y = 2;
---END

---FILE: src/c.ts
---CREATE
export const z = 3;
---END

SUMMARY: Updated constants`;

    const { edits, summary } = parseEdits(response);
    expect(edits).toHaveLength(3);
    expect(edits[0].path).toBe('src/a.ts');
    expect(edits[0].type).toBe('modify');
    expect(edits[1].path).toBe('src/b.ts');
    expect(edits[1].type).toBe('modify');
    expect(edits[2].path).toBe('src/c.ts');
    expect(edits[2].type).toBe('create');
    expect(summary).toBe('Updated constants');
  });

  it('returns empty edits for response with no markers', () => {
    const { edits, summary } = parseEdits('Just some text with no edit markers');
    expect(edits).toHaveLength(0);
    expect(summary).toBe('');
  });

  it('extracts summary from anywhere in the response', () => {
    const response = `SUMMARY: Did the thing

---FILE: src/x.ts
---SEARCH
a
---REPLACE
b
---END`;

    const { summary } = parseEdits(response);
    expect(summary).toBe('Did the thing');
  });

  it('handles multiple search/replace blocks for same file', () => {
    const response = `---FILE: src/x.ts
---SEARCH
const a = 1;
---REPLACE
const a = 10;
---END

---FILE: src/x.ts
---SEARCH
const b = 2;
---REPLACE
const b = 20;
---END`;

    const { edits } = parseEdits(response);
    expect(edits).toHaveLength(2);
    expect(edits[0].path).toBe('src/x.ts');
    expect(edits[1].path).toBe('src/x.ts');
  });
});

describe('findAndReplace', () => {
  it('replaces exact match', () => {
    const content = 'hello world';
    expect(findAndReplace(content, 'world', 'earth')).toBe('hello earth');
  });

  it('returns null when search not found', () => {
    expect(findAndReplace('hello world', 'mars', 'earth')).toBeNull();
  });

  it('replaces only first occurrence', () => {
    const content = 'aaa';
    expect(findAndReplace(content, 'a', 'b')).toBe('baa');
  });

  it('handles multi-line search', () => {
    const content = 'line1\nline2\nline3';
    const result = findAndReplace(content, 'line1\nline2', 'changed1\nchanged2');
    expect(result).toBe('changed1\nchanged2\nline3');
  });

  it('normalizes CRLF line endings', () => {
    const content = 'line1\r\nline2\r\nline3';
    const result = findAndReplace(content, 'line1\nline2', 'changed');
    expect(result).not.toBeNull();
    expect(result).toContain('changed');
    expect(result).toContain('line3');
  });

  it('tolerates trailing whitespace differences', () => {
    const content = 'hello   \nworld   ';
    const result = findAndReplace(content, 'hello\nworld', 'changed');
    expect(result).not.toBeNull();
    expect(result).toContain('changed');
  });

  it('handles empty search and replace', () => {
    const content = 'hello';
    const result = findAndReplace(content, '', 'prefix');
    expect(result).toBe('prefixhello');
  });

  it('preserves surrounding content', () => {
    const content = 'before\ntarget\nafter';
    const result = findAndReplace(content, 'target', 'replaced');
    expect(result).toBe('before\nreplaced\nafter');
  });
});
