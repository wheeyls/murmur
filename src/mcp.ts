#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { SubscribeRequestSchema, UnsubscribeRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import http from 'node:http';
import { createProxyServer } from './proxy.js';
import { MurmurWebSocket } from './websocket.js';
import type { WSCommandMessage } from './types.js';

interface VoiceCommand {
  transcript: string;
  html: string;
}

let proxyServer: http.Server | null = null;
let wsServer: MurmurWebSocket | null = null;
let proxyPort: number | null = null;

const commandQueue: VoiceCommand[] = [];
let pendingResolver: ((cmd: VoiceCommand) => void) | null = null;

function notifyCommandAvailable(): void {
  try {
    server.server.sendResourceUpdated({ uri: 'murmur://commands/pending' });
  } catch {
    // Not connected yet or client doesn't support subscriptions — ignore
  }
}

function enqueueCommand(cmd: VoiceCommand): void {
  if (pendingResolver) {
    const resolve = pendingResolver;
    pendingResolver = null;
    resolve(cmd);
  } else {
    commandQueue.push(cmd);
  }
  notifyCommandAvailable();
}

function waitForCommand(): Promise<VoiceCommand> {
  if (commandQueue.length > 0) {
    return Promise.resolve(commandQueue.shift()!);
  }
  return new Promise((resolve) => {
    pendingResolver = resolve;
  });
}

const server = new McpServer({
  name: 'murmur',
  version: '0.2.0',
}, {
  capabilities: {
    logging: {},
    resources: { subscribe: true },
  },
});

const subscribedUris = new Set<string>();

server.server.setRequestHandler(SubscribeRequestSchema, async (request) => {
  subscribedUris.add(request.params.uri);
  return {};
});

server.server.setRequestHandler(UnsubscribeRequestSchema, async (request) => {
  subscribedUris.delete(request.params.uri);
  return {};
});

server.registerResource(
  'pending_commands',
  'murmur://commands/pending',
  {
    description: [
      'Pending voice commands from the browser overlay.',
      'Subscribe to this resource to get notified when new voice commands arrive.',
      'Read it to get the current queue of unprocessed commands.',
      'This is an event-driven alternative to the blocking murmur_get_command tool.',
    ].join(' '),
    mimeType: 'application/json',
  },
  async () => {
    const commands = commandQueue.map((cmd) => ({
      transcript: cmd.transcript,
      htmlLength: cmd.html.length,
    }));

    return {
      contents: [{
        uri: 'murmur://commands/pending',
        mimeType: 'application/json',
        text: JSON.stringify({
          count: commandQueue.length,
          proxyRunning: proxyServer !== null,
          proxyPort,
          commands,
        }),
      }],
    };
  },
);

server.registerResource(
  'status',
  'murmur://status',
  {
    description: 'Current status of the murmur proxy server.',
    mimeType: 'application/json',
  },
  async () => {
    return {
      contents: [{
        uri: 'murmur://status',
        mimeType: 'application/json',
        text: JSON.stringify({
          running: proxyServer !== null,
          port: proxyPort,
          pendingCommands: commandQueue.length,
          hasWaitingConsumer: pendingResolver !== null,
        }),
      }],
    };
  },
);

server.registerTool(
  'murmur_start',
  {
    title: 'Start Murmur Proxy',
    description: [
      'Start the murmur proxy server. This injects a voice overlay widget into the target web app.',
      'The user will see a floating microphone button in their browser.',
      'Call murmur_get_command after this to receive voice commands.',
    ].join(' '),
    inputSchema: z.object({
      target: z.string().describe('Dev server URL to proxy, e.g. http://localhost:3000'),
      port: z.number().optional().default(4444).describe('Port for the murmur proxy (default: 4444)'),
    }),
  },
  async ({ target, port }) => {
    if (proxyServer) {
      return {
        content: [{ type: 'text' as const, text: `Proxy already running on port ${proxyPort}. Stop it first with murmur_stop.` }],
      };
    }

    const config = {
      target,
      port,
      provider: 'anthropic' as const,
      projectRoot: process.cwd(),
    };

    proxyServer = createProxyServer(config);
    proxyPort = port;

    wsServer = new MurmurWebSocket(
      proxyServer,
      async (msg: WSCommandMessage) => {
        enqueueCommand({ transcript: msg.transcript, html: msg.html });
      },
      async () => {
        enqueueCommand({ transcript: '__UNDO__', html: '' });
      },
    );

    await new Promise<void>((resolve) => {
      proxyServer!.listen(port, () => resolve());
    });

    return {
      content: [{
        type: 'text' as const,
        text: [
          `Murmur proxy started.`,
          `Proxying: ${target} → http://localhost:${port}`,
          `Tell the user to open http://localhost:${port} in Chrome.`,
          `The page will show their app with a floating mic button.`,
          `Call murmur_get_command to wait (blocking), or subscribe to murmur://commands/pending for event-driven updates.`,
        ].join('\n'),
      }],
    };
  },
);

server.registerTool(
  'murmur_get_command',
  {
    title: 'Get Voice Command',
    description: [
      'Wait for the next voice command from the user.',
      'This BLOCKS until the user speaks into the mic or types a command.',
      'Returns the transcript (what they said) and the page HTML (what they see).',
      'Use the HTML to understand spatial references like "that button" or "the header".',
      'After receiving a command, edit the source files, then call murmur_send_status.',
      'If transcript is "__UNDO__", the user clicked the undo button.',
    ].join(' '),
    inputSchema: z.object({}),
  },
  async () => {
    if (!proxyServer) {
      return {
        content: [{ type: 'text' as const, text: 'Proxy not running. Call murmur_start first.' }],
      };
    }

    const cmd = await waitForCommand();

    if (cmd.transcript === '__UNDO__') {
      return {
        content: [{ type: 'text' as const, text: 'UNDO requested. Revert your last file changes, then call murmur_send_status with state "applied" and call murmur_reload.' }],
      };
    }

    wsServer?.broadcast({ type: 'status', state: 'processing', transcript: cmd.transcript });

    const truncatedHtml = cmd.html.length > 60_000
      ? cmd.html.slice(0, 60_000) + '\n<!-- truncated -->'
      : cmd.html;

    return {
      content: [
        { type: 'text' as const, text: `Voice command: "${cmd.transcript}"` },
        { type: 'text' as const, text: `Page HTML (what the user sees):\n${truncatedHtml}` },
      ],
    };
  },
);

server.registerTool(
  'murmur_read_command',
  {
    title: 'Read Pending Command',
    description: [
      'Non-blocking read of the next pending voice command.',
      'Use this after receiving a notifications/resources/updated event for murmur://commands/pending.',
      'Returns the next command if one is queued, or indicates the queue is empty.',
      'Unlike murmur_get_command, this does NOT block — it returns immediately.',
      'After receiving a command, edit the source files, then call murmur_send_status.',
      'If transcript is "__UNDO__", the user clicked the undo button.',
    ].join(' '),
    inputSchema: z.object({}),
  },
  async () => {
    if (!proxyServer) {
      return {
        content: [{ type: 'text' as const, text: 'Proxy not running. Call murmur_start first.' }],
      };
    }

    if (commandQueue.length === 0) {
      return {
        content: [{ type: 'text' as const, text: 'No pending commands.' }],
      };
    }

    const cmd = commandQueue.shift()!;

    if (cmd.transcript === '__UNDO__') {
      return {
        content: [{ type: 'text' as const, text: 'UNDO requested. Revert your last file changes, then call murmur_send_status with state "applied" and call murmur_reload.' }],
      };
    }

    wsServer?.broadcast({ type: 'status', state: 'processing', transcript: cmd.transcript });

    const truncatedHtml = cmd.html.length > 60_000
      ? cmd.html.slice(0, 60_000) + '\n<!-- truncated -->'
      : cmd.html;

    return {
      content: [
        { type: 'text' as const, text: `Voice command: "${cmd.transcript}"` },
        { type: 'text' as const, text: `Page HTML (what the user sees):\n${truncatedHtml}` },
      ],
    };
  },
);

server.registerTool(
  'murmur_send_status',
  {
    title: 'Send Status to Overlay',
    description: [
      'Update the overlay widget shown in the user\'s browser.',
      'Call this after processing a voice command to show the result.',
      'States: "processing" (thinking), "applied" (success), "error" (failed).',
    ].join(' '),
    inputSchema: z.object({
      state: z.enum(['processing', 'applied', 'error']).describe('Status state'),
      message: z.string().describe('Short message shown to the user, e.g. "Changed header to blue"'),
    }),
  },
  async ({ state, message }) => {
    if (!wsServer) {
      return {
        content: [{ type: 'text' as const, text: 'Proxy not running.' }],
      };
    }

    if (state === 'applied') {
      wsServer.broadcast({ type: 'status', state: 'applied', summary: message });
    } else if (state === 'error') {
      wsServer.broadcast({ type: 'status', state: 'error', message });
    } else {
      wsServer.broadcast({ type: 'status', state: 'processing', transcript: message });
    }

    return {
      content: [{ type: 'text' as const, text: `Status sent: ${state} — "${message}"` }],
    };
  },
);

server.registerTool(
  'murmur_reload',
  {
    title: 'Reload Browser',
    description: [
      'Trigger a page reload in the user\'s browser.',
      'Call this after editing files if the dev server\'s HMR doesn\'t pick up changes.',
      'For Vite/Next.js/webpack, HMR usually handles it automatically — only call this as fallback.',
    ].join(' '),
    inputSchema: z.object({}),
  },
  async () => {
    if (!wsServer) {
      return {
        content: [{ type: 'text' as const, text: 'Proxy not running.' }],
      };
    }

    wsServer.sendReload();
    return {
      content: [{ type: 'text' as const, text: 'Reload signal sent to browser.' }],
    };
  },
);

server.registerTool(
  'murmur_stop',
  {
    title: 'Stop Murmur Proxy',
    description: 'Stop the proxy server and clean up.',
    inputSchema: z.object({}),
  },
  async () => {
    if (!proxyServer) {
      return {
        content: [{ type: 'text' as const, text: 'Proxy not running.' }],
      };
    }

    proxyServer.close();
    proxyServer = null;
    wsServer = null;

    if (pendingResolver) {
      pendingResolver({ transcript: '__SHUTDOWN__', html: '' });
      pendingResolver = null;
    }

    return {
      content: [{ type: 'text' as const, text: 'Murmur proxy stopped.' }],
    };
  },
);

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write('murmur MCP server running on stdio\n');
}

main().catch((err) => {
  process.stderr.write(`Fatal: ${err.message}\n`);
  process.exit(1);
});
