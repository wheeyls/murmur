import fs from 'node:fs/promises';
import path from 'node:path';
import ignore, { type Ignore } from 'ignore';

const DEFAULT_IGNORE = [
  'node_modules',
  '.git',
  'dist',
  'build',
  '.next',
  '.nuxt',
  '.svelte-kit',
  'vendor',
  'tmp',
  'log',
  'coverage',
  '.cache',
  '.turbo',
  '*.lock',
  'package-lock.json',
  'yarn.lock',
  'pnpm-lock.yaml',
  '.env*',
  '*.map',
  '*.min.js',
  '*.min.css',
  '*.png',
  '*.jpg',
  '*.jpeg',
  '*.gif',
  '*.svg',
  '*.ico',
  '*.woff',
  '*.woff2',
  '*.ttf',
  '*.eot',
  '*.mp4',
  '*.mp3',
  '*.wav',
  '*.pdf',
  '*.zip',
  '*.tar.gz',
];

const SOURCE_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
  '.vue', '.svelte',
  '.html', '.htm', '.erb', '.haml', '.slim', '.ejs', '.hbs', '.pug',
  '.css', '.scss', '.sass', '.less',
  '.json', '.yaml', '.yml',
  '.py', '.rb', '.php',
]);

// Files to always include if they exist (project config)
const PRIORITY_FILES = [
  'package.json',
  'tsconfig.json',
  'vite.config.ts',
  'vite.config.js',
  'next.config.js',
  'next.config.ts',
  'next.config.mjs',
  'tailwind.config.js',
  'tailwind.config.ts',
];

export async function gatherContext(
  projectRoot: string,
  maxChars: number = 400_000,
): Promise<Map<string, string>> {
  const ig = buildIgnore(projectRoot);
  const files = new Map<string, string>();
  let totalChars = 0;

  // First: priority files
  for (const pf of PRIORITY_FILES) {
    const fullPath = path.join(projectRoot, pf);
    try {
      const content = await fs.readFile(fullPath, 'utf-8');
      if (totalChars + content.length < maxChars) {
        files.set(pf, content);
        totalChars += content.length;
      }
    } catch {
      // File doesn't exist, skip
    }
  }

  // Then: walk the tree
  await walk(projectRoot, projectRoot, ig, files, { totalChars, maxChars });

  return files;
}

async function walk(
  dir: string,
  root: string,
  ig: Ignore,
  files: Map<string, string>,
  budget: { totalChars: number; maxChars: number },
): Promise<void> {
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }

  // Sort: files first, then directories (breadth-first-ish)
  const sorted = entries.sort((a, b) => {
    if (a.isFile() && b.isDirectory()) return -1;
    if (a.isDirectory() && b.isFile()) return 1;
    return a.name.localeCompare(b.name);
  });

  for (const entry of sorted) {
    if (budget.totalChars >= budget.maxChars) return;

    const fullPath = path.join(dir, entry.name);
    const relativePath = path.relative(root, fullPath);

    if (ig.ignores(relativePath)) continue;

    if (entry.isDirectory()) {
      if (ig.ignores(relativePath + '/')) continue;
      await walk(fullPath, root, ig, files, budget);
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      if (!SOURCE_EXTENSIONS.has(ext)) continue;
      if (files.has(relativePath)) continue; // already added as priority

      try {
        const stat = await fs.stat(fullPath);
        if (stat.size > 100_000) continue; // skip files > 100KB
        if (budget.totalChars + stat.size > budget.maxChars) continue;

        const content = await fs.readFile(fullPath, 'utf-8');
        files.set(relativePath, content);
        budget.totalChars += content.length;
      } catch {
        // Skip unreadable files
      }
    }
  }
}

function buildIgnore(projectRoot: string): Ignore {
  const ig = ignore();
  ig.add(DEFAULT_IGNORE);

  // Try to read .gitignore synchronously would be nicer but we're async anyway
  try {
    // Read .gitignore if it exists - we'll do this synchronously via a workaround
    const fs2 = require('node:fs');
    const gitignorePath = path.join(projectRoot, '.gitignore');
    if (fs2.existsSync(gitignorePath)) {
      const gitignore = fs2.readFileSync(gitignorePath, 'utf-8');
      ig.add(gitignore);
    }
  } catch {
    // No .gitignore, that's fine
  }

  return ig;
}

export async function getFileTree(projectRoot: string): Promise<string[]> {
  const ig = buildIgnore(projectRoot);
  const tree: string[] = [];

  async function walkTree(dir: string): Promise<void> {
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      const relativePath = path.relative(projectRoot, fullPath);

      if (ig.ignores(relativePath)) continue;

      if (entry.isDirectory()) {
        if (ig.ignores(relativePath + '/')) continue;
        tree.push(relativePath + '/');
        await walkTree(fullPath);
      } else {
        const ext = path.extname(entry.name).toLowerCase();
        if (SOURCE_EXTENSIONS.has(ext)) {
          tree.push(relativePath);
        }
      }
    }
  }

  await walkTree(projectRoot);
  return tree;
}
