# murmur

Voice-driven AI frontend editor. Speak changes to your app, see them live.

```
you: "make the header blue and add a search bar"
murmur: ✓ applied 2 edits → browser updates instantly
```

## How it works

Murmur sits between your browser and your dev server as a lightweight proxy. It injects a tiny floating microphone widget into your page. You click the mic, describe a change in plain English, and murmur sends your voice command (plus context about your source files and what's currently rendered) to an AI model. The AI generates targeted code edits, murmur writes them to disk, and your dev server's hot module reloading picks up the changes automatically.

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Browser    │◄───►│   Murmur    │◄───►│  Dev Server  │
│  (your app   │     │  (proxy +   │     │  (vite, next,│
│  + mic widget│     │   AI + edit) │     │  rails, etc) │
└─────────────┘     └─────────────┘     └─────────────┘
       │                    │
       │  voice command     │  file edits
       │  + page HTML       │  on disk
       │                    │
       ▼                    ▼
   Web Speech API     Claude / GPT-4o
```

**The loop:**
1. You see your app in the browser
2. You click the mic (or press `/` to type)
3. You describe what you want changed
4. Murmur edits your source files
5. Your dev server hot-reloads the page
6. You see the result. Repeat.

## Quick start

### Prerequisites

- Node.js 18+
- Chrome (for voice input — Web Speech API)
- An API key: `ANTHROPIC_API_KEY` or `OPENAI_API_KEY`

### Try the demo

```bash
git clone https://github.com/YOUR_USER/murmur.git
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

## CLI reference

```
murmur [target-url] [options]

Arguments:
  target-url          Dev server URL to proxy (default: http://localhost:3000)

Options:
  -p, --port <n>      Proxy port (default: 4444)
  --provider <name>   AI provider: anthropic or openai (default: anthropic)
  -m, --model <name>  AI model override
  -r, --root <path>   Project root directory (default: current working directory)
  -h, --help          Show help
```

### Environment variables

| Variable | Required for | Default model |
|----------|-------------|---------------|
| `ANTHROPIC_API_KEY` | `--provider anthropic` | `claude-sonnet-4-20250514` |
| `OPENAI_API_KEY` | `--provider openai` | `gpt-4o` |

If both keys are set, Anthropic is used by default. Use `--provider openai` to override.

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
| **Rails** | Reload fallback | Murmur triggers a full page reload after edits. Works with ERB, HAML, etc. |
| **Django** | Reload fallback | Same reload fallback. Works with templates. |
| **Static HTML** | Reload fallback | Any static file server works. |

For frameworks without HMR, murmur sends a reload signal via WebSocket ~300ms after applying edits.

## How the AI edits work

When you speak a command, murmur:

1. **Captures context** — your page's rendered HTML (so the AI sees what you see) plus all source files in your project (respecting `.gitignore`, skipping binaries/lock files)
2. **Sends to AI** — the voice transcript + context goes to Claude or GPT-4o with a system prompt that instructs the model to return structured file edits
3. **Parses edits** — the AI returns edits in a SEARCH/REPLACE format that maps to exact file modifications
4. **Applies to disk** — edits are written to your actual source files with a snapshot saved for undo
5. **Triggers reload** — your dev server's file watcher picks up changes, or murmur sends a reload signal as fallback

The AI maintains conversation history, so you can iterate naturally:
- "make the header blue"
- "now make it a gradient"
- "add a search bar next to the logo"
- "undo that"

## Project structure

```
murmur/
├── src/
│   ├── index.ts        CLI entry point, server orchestration
│   ├── proxy.ts        HTTP proxy with HTML script injection
│   ├── websocket.ts    WebSocket server for overlay communication
│   ├── ai.ts           Anthropic + OpenAI integration
│   ├── editor.ts       Edit parser and file applier with undo
│   ├── context.ts      Project file gatherer (respects .gitignore)
│   ├── overlay.ts      Client-side overlay widget (vanilla JS)
│   └── types.ts        Shared TypeScript types
├── example/            Demo Vite + React app
├── scripts/
│   └── demo.sh         One-command demo launcher
└── package.json
```

## Tips for best results

- **Be specific** — "change the hero title font size to 48px" works better than "make it bigger"
- **Reference what you see** — "the blue button in the header" helps the AI locate the right element
- **Iterate** — make small changes and build up. The AI remembers your conversation.
- **Use undo freely** — every change is reversible. Experiment without fear.
- **Check the terminal** — murmur logs every edit it applies, so you can see exactly what changed

## Limitations

- **Voice input requires Chrome** — Web Speech API isn't available in Firefox. Use text input (press `/`) as fallback.
- **HTTP only** — HTTPS dev servers aren't supported yet.
- **Project size** — very large projects (>400K chars of source) will have context truncated. Most frontend projects fit easily.
- **No image understanding** — the AI sees your rendered HTML, not a screenshot. It can't interpret visual layouts pixel-perfectly.

## License

MIT
