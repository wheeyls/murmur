#!/usr/bin/env node
import pc from 'picocolors';
import { createProxyServer } from './proxy.js';
import { MurmurWebSocket } from './websocket.js';
import type { WSCommandMessage } from './types.js';
import type { Backend } from './backends/types.js';
import { BuiltinBackend } from './backends/builtin.js';
import { ClaudeCodeBackend, OpenCodeBackend } from './backends/claude-code.js';
import { PipeBackend } from './backends/pipe.js';

type BackendType = 'builtin' | 'claude-code' | 'opencode' | 'pipe';

interface ParsedConfig {
  target: string;
  port: number;
  backendType: BackendType;
  provider: 'anthropic' | 'openai';
  model?: string;
  projectRoot: string;
}

function parseArgs(argv: string[]): ParsedConfig {
  const args = argv.slice(2);
  let target = 'http://localhost:3000';
  let port = 4444;
  let backendType: BackendType = 'builtin';
  let provider: 'anthropic' | 'openai' = 'anthropic';
  let model: string | undefined;
  let projectRoot = process.cwd();

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--port' || arg === '-p') {
      port = parseInt(args[++i], 10);
    } else if (arg === '--backend' || arg === '-b') {
      backendType = args[++i] as BackendType;
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

  if (backendType === 'builtin') {
    if (provider === 'openai' && !process.env.OPENAI_API_KEY) {
      console.error(pc.red('Error: OPENAI_API_KEY environment variable not set'));
      process.exit(1);
    }
    if (provider === 'anthropic' && !process.env.ANTHROPIC_API_KEY) {
      console.error(pc.red('Error: ANTHROPIC_API_KEY environment variable not set'));
      process.exit(1);
    }
  }

  return { target, port, backendType, provider, model, projectRoot };
}

function createBackend(config: ParsedConfig): Backend {
  switch (config.backendType) {
    case 'claude-code':
      return new ClaudeCodeBackend(config.projectRoot, config.model);
    case 'opencode':
      return new OpenCodeBackend(config.projectRoot, config.model);
    case 'pipe':
      return new PipeBackend(config.projectRoot);
    case 'builtin':
    default:
      return new BuiltinBackend({
        target: config.target,
        port: config.port,
        provider: config.provider,
        model: config.model,
        projectRoot: config.projectRoot,
      });
  }
}

function printHelp(): void {
  console.log(`
${pc.bold(pc.magenta('murmur'))} — voice-driven AI frontend editor

${pc.bold('Usage:')}
  murmur [target-url] [options]

${pc.bold('Arguments:')}
  target-url              Dev server URL to proxy (default: http://localhost:3000)

${pc.bold('Options:')}
  -p, --port <n>          Proxy port (default: 4444)
  -b, --backend <type>    Backend: builtin, claude-code, opencode, pipe (default: builtin)
  --provider <name>       AI provider for builtin: anthropic or openai (default: anthropic)
  -m, --model <name>      AI model override
  -r, --root <path>       Project root directory (default: cwd)
  -h, --help              Show this help

${pc.bold('Backends:')}
  ${pc.cyan('builtin')}       Direct API calls to Anthropic/OpenAI (default)
  ${pc.cyan('claude-code')}   Uses 'claude' CLI — full tool suite, LSP, verified edits
  ${pc.cyan('opencode')}      Uses 'opencode run' CLI — same tools, OpenCode sessions
  ${pc.cyan('pipe')}          File-based pipe — writes commands to .murmur/inbox/,
                  reads results from .murmur/outbox/. Works with any tool.

${pc.bold('Environment:')}
  ANTHROPIC_API_KEY       Required for builtin + anthropic provider
  OPENAI_API_KEY          Required for builtin + openai provider

${pc.bold('Examples:')}
  ${pc.dim('# Builtin (direct API calls):')}
  murmur http://localhost:5173 --backend builtin

  ${pc.dim('# Claude Code (uses claude CLI, full tool suite):')}
  murmur http://localhost:5173 --backend claude-code

  ${pc.dim('# OpenCode (uses opencode CLI):')}
  murmur http://localhost:5173 --backend opencode

  ${pc.dim('# Pipe (any external processor):')}
  murmur http://localhost:5173 --backend pipe

  ${pc.dim('# Multiple instances (different ports, different projects):')}
  murmur http://localhost:3000 -p 4444 -r ./frontend
  murmur http://localhost:3001 -p 4445 -r ./admin
`);
}

async function main(): Promise<void> {
  const config = parseArgs(process.argv);
  const backend = createBackend(config);

  console.log('');
  console.log(pc.bold(pc.magenta('  murmur')) + pc.dim(' — voice-driven AI frontend editor'));
  console.log('');

  const server = createProxyServer({
    target: config.target,
    port: config.port,
    provider: config.provider,
    model: config.model,
    projectRoot: config.projectRoot,
  });

  const wsServer = new MurmurWebSocket(
    server,
    async (msg: WSCommandMessage) => {
      await handleCommand(msg, backend, wsServer);
    },
    async () => {
      await handleUndo(backend, wsServer);
    },
  );

  server.listen(config.port, () => {
    console.log(pc.dim('  target  → ') + pc.cyan(config.target));
    console.log(pc.dim('  proxy   → ') + pc.cyan(`http://localhost:${config.port}`));
    console.log(pc.dim('  root    → ') + pc.cyan(config.projectRoot));
    console.log(pc.dim('  backend → ') + pc.cyan(backend.type));
    if (config.backendType === 'builtin') {
      console.log(pc.dim('  provider→ ') + pc.cyan(`${config.provider}${config.model ? ` (${config.model})` : ''}`));
    }
    if (config.backendType === 'pipe') {
      console.log(pc.dim('  inbox   → ') + pc.cyan(`${config.projectRoot}/.murmur/inbox/`));
      console.log(pc.dim('  outbox  → ') + pc.cyan(`${config.projectRoot}/.murmur/outbox/`));
    }
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
  backend: Backend,
  wsServer: MurmurWebSocket,
): Promise<void> {
  const transcript = msg.transcript;
  console.log(pc.dim('  voice → ') + pc.white(transcript));

  wsServer.broadcast({ type: 'status', state: 'processing', transcript });

  try {
    const result = await backend.processCommand(transcript, msg.html);

    if (!result.success) {
      console.log(pc.yellow(`  failed: ${result.error}`));
      wsServer.broadcast({ type: 'status', state: 'error', message: result.error });
      return;
    }

    console.log(pc.green(`  ✓ ${result.summary}`));
    if (result.filesChanged) {
      for (const f of result.filesChanged) {
        console.log(pc.dim(`    ~ ${f}`));
      }
    }

    wsServer.broadcast({ type: 'status', state: 'applied', summary: result.summary });
    setTimeout(() => wsServer.sendReload(), 300);

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.log(pc.red(`  error: ${message}`));
    wsServer.broadcast({ type: 'status', state: 'error', message });
  }
}

async function handleUndo(
  backend: Backend,
  wsServer: MurmurWebSocket,
): Promise<void> {
  try {
    const result = await backend.undo();
    if (result.success) {
      console.log(pc.dim('  undo applied'));
      wsServer.broadcast({ type: 'undo_done' });
      setTimeout(() => wsServer.sendReload(), 300);
    } else {
      wsServer.broadcast({ type: 'status', state: 'error', message: result.error });
    }
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
