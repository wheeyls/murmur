#!/usr/bin/env node
import pc from 'picocolors';
import { createProxyServer } from './proxy.js';
import { MurmurWebSocket } from './websocket.js';
import { AI } from './ai.js';
import { gatherContext } from './context.js';
import { parseEdits, applyEdits, undoEdits } from './editor.js';
import type { MurmurConfig, WSCommandMessage, FileSnapshot } from './types.js';

function parseArgs(argv: string[]): MurmurConfig {
  const args = argv.slice(2);
  let target = 'http://localhost:3000';
  let port = 4444;
  let provider: 'anthropic' | 'openai' = 'anthropic';
  let model: string | undefined;
  let projectRoot = process.cwd();

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--port' || arg === '-p') {
      port = parseInt(args[++i], 10);
    } else if (arg === '--provider') {
      provider = args[++i] as 'anthropic' | 'openai';
    } else if (arg === '--model' || arg === '-m') {
      model = args[++i];
    } else if (arg === '--root' || arg === '-r') {
      projectRoot = args[++i];
    } else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    } else if (!arg.startsWith('-')) {
      target = arg;
    }
  }

  if (provider === 'openai' && !process.env.OPENAI_API_KEY) {
    console.error(pc.red('Error: OPENAI_API_KEY environment variable not set'));
    process.exit(1);
  }
  if (provider === 'anthropic' && !process.env.ANTHROPIC_API_KEY) {
    console.error(pc.red('Error: ANTHROPIC_API_KEY environment variable not set'));
    process.exit(1);
  }

  return { target, port, provider, model, projectRoot };
}

function printHelp(): void {
  console.log(`
${pc.bold(pc.magenta('murmur'))} — voice-driven AI frontend editor

${pc.bold('Usage:')}
  murmur [target-url] [options]

${pc.bold('Arguments:')}
  target-url          Dev server URL to proxy (default: http://localhost:3000)

${pc.bold('Options:')}
  -p, --port <n>      Proxy port (default: 4444)
  --provider <name>   AI provider: anthropic or openai (default: anthropic)
  -m, --model <name>  AI model override
  -r, --root <path>   Project root directory (default: cwd)
  -h, --help          Show this help

${pc.bold('Environment:')}
  ANTHROPIC_API_KEY    Required for Anthropic provider
  OPENAI_API_KEY       Required for OpenAI provider

${pc.bold('Example:')}
  ${pc.dim('# Start your dev server, then:')}
  murmur http://localhost:5173
  ${pc.dim('# Open http://localhost:4444 in Chrome')}
  ${pc.dim('# Click the mic and speak your changes')}
`);
}

async function main(): Promise<void> {
  const config = parseArgs(process.argv);
  const ai = new AI(config);
  const undoStack: FileSnapshot[][] = [];

  console.log('');
  console.log(pc.bold(pc.magenta('  murmur')) + pc.dim(' — voice-driven AI frontend editor'));
  console.log('');

  const server = createProxyServer(config);

  const wsServer = new MurmurWebSocket(
    server,
    async (msg: WSCommandMessage) => {
      await handleCommand(msg, config, ai, wsServer, undoStack);
    },
    async () => {
      await handleUndo(config, wsServer, undoStack);
    },
  );

  server.listen(config.port, () => {
    console.log(pc.dim('  target  → ') + pc.cyan(config.target));
    console.log(pc.dim('  proxy   → ') + pc.cyan(`http://localhost:${config.port}`));
    console.log(pc.dim('  root    → ') + pc.cyan(config.projectRoot));
    console.log(pc.dim('  provider→ ') + pc.cyan(`${config.provider}${config.model ? ` (${config.model})` : ''}`));
    console.log('');
    console.log(pc.green('  Ready. Open the proxy URL in Chrome and click the mic.'));
    console.log('');
  });

  process.on('SIGINT', () => {
    console.log(pc.dim('\n  Shutting down...'));
    server.close();
    process.exit(0);
  });
}

async function handleCommand(
  msg: WSCommandMessage,
  config: MurmurConfig,
  ai: AI,
  wsServer: MurmurWebSocket,
  undoStack: FileSnapshot[][],
): Promise<void> {
  const transcript = msg.transcript;
  console.log(pc.dim('  voice → ') + pc.white(transcript));

  wsServer.broadcast({ type: 'status', state: 'processing', transcript });

  try {
    const files = await gatherContext(config.projectRoot);
    console.log(pc.dim(`  context: ${files.size} files`));

    const response = await ai.processCommand(transcript, files, msg.html);
    const { edits, summary } = parseEdits(response);

    if (edits.length === 0) {
      wsServer.broadcast({
        type: 'status',
        state: 'error',
        message: 'No edits generated. Try rephrasing your request.',
      });
      console.log(pc.yellow('  no edits generated'));
      return;
    }

    const result = await applyEdits(edits, config.projectRoot);
    undoStack.push(result.snapshots);

    if (result.failed.length > 0) {
      console.log(pc.yellow(`  applied ${result.applied}/${edits.length} edits`));
      for (const f of result.failed) {
        console.log(pc.red(`    ✗ ${f}`));
      }
    } else {
      console.log(pc.green(`  applied ${result.applied} edit${result.applied !== 1 ? 's' : ''}`));
    }

    for (const edit of edits) {
      const action = edit.type === 'create' ? '+' : edit.type === 'delete' ? '-' : '~';
      console.log(pc.dim(`    ${action} ${edit.path}`));
    }

    if (summary) {
      console.log(pc.dim(`  summary: ${summary}`));
    }

    wsServer.broadcast({
      type: 'status',
      state: 'applied',
      summary: summary || `Applied ${result.applied} edit${result.applied !== 1 ? 's' : ''}`,
    });

    setTimeout(() => {
      wsServer.sendReload();
    }, 300);

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.log(pc.red(`  error: ${message}`));
    wsServer.broadcast({ type: 'status', state: 'error', message });
  }
}

async function handleUndo(
  config: MurmurConfig,
  wsServer: MurmurWebSocket,
  undoStack: FileSnapshot[][],
): Promise<void> {
  const snapshots = undoStack.pop();
  if (!snapshots) {
    wsServer.broadcast({ type: 'status', state: 'error', message: 'Nothing to undo' });
    return;
  }

  try {
    await undoEdits(snapshots, config.projectRoot);
    console.log(pc.dim('  undo applied'));
    wsServer.broadcast({ type: 'undo_done' });
    setTimeout(() => wsServer.sendReload(), 300);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.log(pc.red(`  undo error: ${message}`));
    wsServer.broadcast({ type: 'status', state: 'error', message: `Undo failed: ${message}` });
  }
}

main().catch((err) => {
  console.error(pc.red(`Fatal: ${err.message}`));
  process.exit(1);
});
