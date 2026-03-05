# murmur

Voice-driven AI frontend editor. Speak changes to your app, see them live.

```
you: "make the header blue and add a search bar"
murmur: ✓ applied 2 edits → browser updates instantly
```

## How it works

Murmur sits between your browser and your dev server as a lightweight proxy. It injects a tiny floating microphone widget into your page. You click the mic, describe a change in plain English, and murmur routes your voice command to an AI backend that edits your source files. Your dev server's HMR picks up the changes automatically.

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Browser    │◄───►│   Murmur    │◄───►│  Dev Server  │
│  (your app   │     │  (proxy +   │     │  (vite, next,│
│  + mic widget│     │   MCP)      │     │  rails, etc) │
└─────────────┘     └─────────────┘     └─────────────┘
       │                    ▲
       │  voice command     │  MCP tool calls
       │  + page HTML       │
       ▼                    ▼
   Web Speech API     ┌──────────────┐
                      │  AI Agent    │
                      │              │
                      │ Claude Desktop│
                      │ OpenCode     │
                      │ Cursor       │
                      │ (any MCP host)│
                      └──────────────┘
```

**The loop (MCP — recommended):**
1. You see your app in the browser
2. You click the mic (or press `/` to type)
3. The AI agent receives your command via `murmur_get_command`
4. The agent edits files using its full tool suite (LSP, grep, etc.)
5. The agent calls `murmur_send_status` → overlay shows "Done!"
6. Your dev server hot-reloads the page. Repeat.

**Standalone mode** also available — murmur handles AI calls itself via `--backend builtin`.

## Quick start

### Prerequisites

- Node.js 18+
- Chrome (for voice input — Web Speech API)
- One of: `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `claude` CLI, or `opencode` CLI

### Try the demo

```bash
git clone https://github.com/wheeyls/murmur.git
cd murmur

export ANTHROPIC_API_KEY=sk-ant-...  # or OPENAI_API_KEY

npm run demo
```

This starts a sample React app on port 3000 and murmur's proxy on port 4444. Open `http://localhost:4444` in Chrome.

### Use with your own project

```bash
# 1. Start your dev server as usual
cd your-project
npm run dev  # starts on port 3000

# 2. In another terminal, start murmur pointing at it
cd /path/to/murmur
npm install
npx tsx src/index.ts http://localhost:3000 --root /path/to/your-project

# 3. Open http://localhost:4444 in Chrome
# 4. Click the mic and speak
```

## MCP Server (recommended)

The best way to use murmur is as an MCP server. Your AI agent (Claude Desktop, OpenCode, Cursor, etc.) connects to murmur and receives voice commands directly — using its full tool suite to make edits.

### OpenCode

Add to your OpenCode MCP config (`~/.config/opencode/opencode.json`):

```json
{
  "mcp": {
    "murmur": {
      "command": "npx",
      "args": ["tsx", "/path/to/murmur/src/mcp.ts"]
    }
  }
}
```

Then in an OpenCode session:

```
You: Start murmur on my dev server at localhost:3000
Agent: [calls murmur_start] → proxy running on :4444
Agent: [calls murmur_get_command] → waiting for voice...
You: (speak into mic) "make the header blue"
Agent: [receives command] → edits files → [calls murmur_send_status("applied")]
Agent: [calls murmur_get_command] → waiting for next...
```

### Claude Desktop

Add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "murmur": {
      "command": "npx",
      "args": ["tsx", "/path/to/murmur/src/mcp.ts"]
    }
  }
}
```

### MCP Tools

| Tool | Description |
|------|-------------|
| `murmur_start` | Start proxy on target URL. Injects overlay widget into the page. |
| `murmur_get_command` | **Blocks** until user speaks or types. Returns transcript + page HTML. |
| `murmur_read_command` | **Non-blocking** read of the next pending command. Use with resource subscriptions. |
| `murmur_send_status` | Push status to overlay: "processing", "applied", or "error". |
| `murmur_reload` | Trigger browser page reload (fallback when HMR doesn't fire). |
| `murmur_stop` | Stop the proxy and clean up. |

### MCP Resources

Murmur exposes resources that MCP hosts can subscribe to for event-driven updates:

| Resource | Description |
|----------|-------------|
| `murmur://commands/pending` | Pending voice commands. Subscribe to get `notifications/resources/updated` when a user speaks. |
| `murmur://status` | Proxy status — whether it's running, port, queue depth. |

**Event-driven flow** (alternative to blocking `murmur_get_command`):

1. Agent calls `murmur_start` to start the proxy
2. Agent subscribes to `murmur://commands/pending`
3. User speaks into the mic
4. Server sends `notifications/resources/updated` for `murmur://commands/pending`
5. Agent calls `murmur_read_command` to get the command (non-blocking)
6. Agent edits files, calls `murmur_send_status`

This is useful for MCP hosts that support resource subscriptions and can react to notifications. Hosts that don't support subscriptions can use the blocking `murmur_get_command` tool instead.

### Why MCP over standalone?

- The agent uses its **real tools** — LSP diagnostics, grep, multi-file editing, AST — not a simple SEARCH/REPLACE parser
- **Full conversation context** — no subprocess spawning, no token re-sending
- **Bidirectional** — agent pushes real-time status to the overlay
- **Works with any MCP host** — Claude Desktop, OpenCode, Cursor, Windsurf, Cline

## Backends (standalone mode)

Murmur also runs standalone without an MCP host. Choose a backend:

### `builtin` (default)

Direct API calls to Anthropic or OpenAI. Murmur gathers your project files, sends them with your voice command, parses the AI's response, and applies edits.

```bash
export ANTHROPIC_API_KEY=sk-ant-...
murmur http://localhost:3000 --backend builtin
```

### `claude-code`

Delegates to the `claude` CLI (Claude Code). Claude handles file reading, editing, and verification itself using its full tool suite — LSP diagnostics, grep, multi-file edits. Strictly better edits than builtin.

```bash
murmur http://localhost:3000 --backend claude-code
```

Requires `claude` CLI installed: `npm i -g @anthropic-ai/claude-code`

Each murmur instance creates its own Claude Code session. Subsequent voice commands resume the same session, so the AI remembers your conversation.

### `opencode`

Delegates to the `opencode` CLI. Same benefits as claude-code — full tool suite, session memory.

```bash
murmur http://localhost:3000 --backend opencode
```

Requires `opencode` CLI installed: `curl -fsSL https://opencode.ai/install | bash`

### `pipe`

Universal file-based pipe. Murmur writes each voice command to `.murmur/inbox/<id>.json` and waits for a result at `.murmur/outbox/<id>.json`. **Any tool** can be the processor — OpenCode, Claude Code, a custom script, anything.

```bash
murmur http://localhost:3000 --backend pipe
```

Command file format (`.murmur/inbox/<id>.json`):
```json
{
  "id": "cmd_1709234_abc123",
  "command": "make the header blue",
  "html": "<html>...(current page)...</html>",
  "timestamp": 1709234567890
}
```

Result file format (`.murmur/outbox/<id>.json`):
```json
{
  "id": "cmd_1709234_abc123",
  "success": true,
  "summary": "Changed header background to blue"
}
```

This is the most flexible backend — see the OpenCode skill below for a ready-made integration.

## OpenCode skill

An OpenCode skill is included at `skills/murmur.md`. It teaches an OpenCode session to process murmur's pipe commands.

**Usage:**
1. Start murmur with `--backend pipe`
2. In OpenCode, load the murmur skill
3. Tell OpenCode to watch `.murmur/inbox/` and process commands
4. Voice commands flow through: browser → murmur → pipe → OpenCode → edits → HMR → browser

## Running multiple instances

Each murmur instance runs on its own port and maintains its own AI session. No cross-talk.

```bash
# Frontend app
murmur http://localhost:3000 -p 4444 -r ./frontend --backend claude-code

# Admin dashboard
murmur http://localhost:3001 -p 4445 -r ./admin --backend claude-code

# Marketing site
murmur http://localhost:4000 -p 4446 -r ./marketing --backend opencode
```

Session routing is automatic — each instance's voice commands go to its own AI session, scoped to its project root.

## CLI reference

```
murmur [target-url] [options]

Arguments:
  target-url              Dev server URL to proxy (default: http://localhost:3000)

Options:
  -p, --port <n>          Proxy port (default: 4444)
  -b, --backend <type>    Backend: builtin, claude-code, opencode, pipe (default: builtin)
  --provider <name>       AI provider for builtin: anthropic or openai (default: anthropic)
  -m, --model <name>      AI model override
  -r, --root <path>       Project root directory (default: cwd)
  -h, --help              Show help
```

### Environment variables

| Variable | Required for | Default model |
|----------|-------------|---------------|
| `ANTHROPIC_API_KEY` | `--backend builtin --provider anthropic` | `claude-sonnet-4-20250514` |
| `OPENAI_API_KEY` | `--backend builtin --provider openai` | `gpt-4o` |

`claude-code` and `opencode` backends use their own auth (configured via their respective CLIs).

## The overlay

When you open the proxied URL, you'll see a small floating button in the bottom-right corner of your page.

**Voice input (Chrome):**
- Click the mic button to start listening
- Speak your change naturally
- After ~2.5 seconds of silence, it auto-sends
- Click again to stop early

**Text input (any browser):**
- Press `/` to open the command panel
- Type your change and press Enter
- Works in Firefox, Safari, etc.

**Other controls:**
- `Escape` — cancel recording or close panel
- **Undo** — click the undo button in the panel to revert the last change
- Command history is preserved across page reloads

### Visual states

| State | Button color | Meaning |
|-------|-------------|---------|
| Idle | Indigo/purple | Ready for input |
| Listening | Red (pulsing) | Recording your voice |
| Processing | Indigo (spinning) | AI is generating edits |
| Applied | Green | Changes applied successfully |
| Error | Red | Something went wrong |

## Framework support

Murmur is framework-agnostic. It works with anything that serves HTML over HTTP.

| Framework | HMR | Notes |
|-----------|-----|-------|
| **Vite** (React, Vue, Svelte) | Native HMR | Best experience. Changes appear instantly. |
| **Next.js** | Fast Refresh | Works great with both App Router and Pages. |
| **webpack-dev-server** | Native HMR | Standard webpack HMR picks up file changes. |
| **Rails** | Reload fallback | Murmur triggers a full page reload after edits. |
| **Django** | Reload fallback | Same reload fallback. Works with templates. |
| **Static HTML** | Reload fallback | Any static file server works. |

For frameworks without HMR, murmur sends a reload signal via WebSocket ~300ms after applying edits.

## Project structure

```
murmur/
├── src/
│   ├── index.ts              CLI entry, server orchestration
│   ├── proxy.ts              HTTP proxy with script injection
│   ├── websocket.ts          WebSocket for overlay communication
│   ├── overlay.ts            Client overlay widget (vanilla JS)
│   ├── backends/
│   │   ├── types.ts          Backend interface
│   │   ├── builtin.ts        Direct API calls (Anthropic/OpenAI)
│   │   ├── claude-code.ts    Claude Code + OpenCode CLI backends
│   │   └── pipe.ts           File-based pipe (universal)
│   ├── mcp.ts                MCP server entry point (stdio)
│   ├── ai.ts                 AI API integration (used by builtin)
│   ├── editor.ts             Edit parser + file applier
│   ├── context.ts            Project file gatherer
│   └── types.ts              Shared types
├── skills/
│   └── murmur.md             OpenCode skill definition
├── example/                  Demo Vite + React app
├── scripts/
│   └── demo.sh               One-command demo launcher
└── package.json
```

## Tips for best results

- **Be specific** — "change the hero title font size to 48px" works better than "make it bigger"
- **Reference what you see** — "the blue button in the header" helps the AI locate elements
- **Iterate** — make small changes and build up. The AI remembers your conversation.
- **Use undo freely** — every change is reversible. Experiment without fear.
- **Use MCP mode** — connect via Claude Desktop or OpenCode for the best edits (full tool suite, LSP, etc.)

## Limitations

- **Voice input requires Chrome** — Web Speech API isn't in Firefox. Use text input (press `/`) as fallback.
- **HTTP only** — HTTPS dev servers aren't supported yet.
- **Project size** — builtin backend truncates at ~400K chars. claude-code/opencode handle larger projects natively.

## License

MIT
