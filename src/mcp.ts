#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { SubscribeRequestSchema, UnsubscribeRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import http from 'node:http';
import { createProxyServer } from './proxy.js';
import { MurmurWebSocket } from './websocket.js';
import { MurmurSession } from './core/session.js';
import type { WSCommandMessage } from './types.js';

const session = new MurmurSession();
let proxyServer: http.Server | null = null;

session.commands.onCommandAvailable = () => {
  try {
    server.server.sendResourceUpdated({ uri: 'murmur://commands/pending' });
  } catch {
    // Not connected yet or client doesn't support subscriptions — ignore
  }
};

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
  async () => ({
    contents: [{
      uri: 'murmur://commands/pending',
      mimeType: 'application/json',
      text: JSON.stringify({
        count: session.commands.pendingCount,
        proxyRunning: session.running,
        proxyPort: session.port,
        commands: session.commands.pending.map((cmd) => ({
          transcript: cmd.transcript,
          htmlLength: cmd.html.length,
        })),
      }),
    }],
  }),
);

server.registerResource(
  'status',
  'murmur://status',
  {
    description: 'Current status of the murmur proxy server.',
    mimeType: 'application/json',
  },
  async () => ({
    contents: [{
      uri: 'murmur://status',
      mimeType: 'application/json',
      text: JSON.stringify(session.getStatus()),
    }],
  }),
);

function text(t: string) {
  return { content: [{ type: 'text' as const, text: t }] };
}

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
    if (session.running) {
      return text(`Proxy already running on port ${session.port}. Stop it first with murmur_stop.`);
    }

    proxyServer = createProxyServer({
      target,
      port,
      provider: 'anthropic' as const,
      projectRoot: process.cwd(),
    });

    const wsServer = new MurmurWebSocket(
      proxyServer,
      async (msg: WSCommandMessage) => {
        session.commands.enqueue({ transcript: msg.transcript, html: msg.html });
      },
      async () => {
        session.commands.enqueue({ transcript: '__UNDO__', html: '' });
      },
    );

    await new Promise<void>((resolve) => {
      proxyServer!.listen(port, () => resolve());
    });

    session.start(port, wsServer);

    return text([
      `Murmur proxy started.`,
      `Proxying: ${target} → http://localhost:${port}`,
      `Tell the user to open http://localhost:${port} in Chrome.`,
      `The page will show their app with a floating mic button.`,
      `Call murmur_get_command to wait (blocking), or subscribe to murmur://commands/pending for event-driven updates.`,
    ].join('\n'));
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
    if (!session.running) return text('Proxy not running. Call murmur_start first.');

    const result = await session.getCommand();

    switch (result.type) {
      case 'undo':
        return text('UNDO requested. Revert your last file changes, then call murmur_send_status with state "applied" and call murmur_reload.');
      case 'shutdown':
        return text('Server shutting down.');
      case 'command':
        return {
          content: [
            { type: 'text' as const, text: `Voice command: "${result.transcript}"` },
            { type: 'text' as const, text: `Page HTML (what the user sees):\n${result.html}` },
          ],
        };
    }
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
    if (!session.running) return text('Proxy not running. Call murmur_start first.');

    const result = session.readCommand();
    if (!result) return text('No pending commands.');

    switch (result.type) {
      case 'undo':
        return text('UNDO requested. Revert your last file changes, then call murmur_send_status with state "applied" and call murmur_reload.');
      case 'shutdown':
        return text('Server shutting down.');
      case 'command':
        return {
          content: [
            { type: 'text' as const, text: `Voice command: "${result.transcript}"` },
            { type: 'text' as const, text: `Page HTML (what the user sees):\n${result.html}` },
          ],
        };
    }
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
    if (!session.running) return text('Proxy not running.');
    session.sendStatus(state, message);
    return text(`Status sent: ${state} — "${message}"`);
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
    if (!session.running) return text('Proxy not running.');
    session.reload();
    return text('Reload signal sent to browser.');
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
    if (!session.running) return text('Proxy not running.');

    proxyServer?.close();
    proxyServer = null;
    session.stop();

    return text('Murmur proxy stopped.');
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
