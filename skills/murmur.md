# Murmur — Voice-Driven Frontend Editing

## What is Murmur?

Murmur is a voice-driven frontend editor. It runs a proxy in front of your dev server and injects a mic widget into your page. When the user speaks a change, it arrives here as a task for you to execute.

## Setup

Start murmur in **pipe** mode so it delegates edits to this session:

```bash
npx tsx /path/to/murmur/src/index.ts http://localhost:<DEV_PORT> --backend pipe --root <PROJECT_ROOT> --port <PROXY_PORT>
```

This creates `.murmur/inbox/` and `.murmur/outbox/` in the project root.

## Processing Loop

When murmur receives a voice command, it writes a JSON file to `.murmur/inbox/`. You should:

1. Watch for new files: `ls .murmur/inbox/`
2. Read each command file (JSON with `id`, `command`, `html` fields)
3. Execute the user's request by editing the project's source files
4. Write a result file to `.murmur/outbox/<id>.json`

### Command file format (`.murmur/inbox/<id>.json`):
```json
{
  "id": "cmd_1234_abc",
  "command": "make the header blue",
  "html": "<html>...(current page HTML)...</html>",
  "timestamp": 1234567890
}
```

### Result file format (`.murmur/outbox/<id>.json`):
```json
{
  "id": "cmd_1234_abc",
  "success": true,
  "summary": "Changed header background to blue"
}
```

Or on error:
```json
{
  "id": "cmd_1234_abc",
  "success": false,
  "summary": "",
  "error": "Could not find header component"
}
```

## How to Process Commands

When you receive a command:

1. **Read the `command` field** — this is what the user said (natural language)
2. **Use the `html` field** for context — it shows what the user is currently seeing in their browser
3. **Make targeted edits** to the project source files using your Edit/Write tools
4. **Be minimal** — only change what the user asked for
5. **Match existing code style** — indentation, naming, CSS approach, etc.
6. **Write the result** to `.murmur/outbox/<id>.json` when done

## Important

- The user is looking at their app in a browser and describing visual changes
- References like "that button", "the header", "the blue thing" map to elements in the HTML
- After you edit files, murmur will trigger a page reload automatically
- The user will then see your changes and may speak again
- Treat this as a conversation — each command builds on the previous ones

## Example Session

```
User speaks: "make the hero title bigger"
→ You: increase font-size of .hero-title in the CSS
→ Write result: { success: true, summary: "Increased hero title font-size to 64px" }

User speaks: "now add a gradient to it"
→ You: add background gradient + background-clip to .hero-title
→ Write result: { success: true, summary: "Added purple-to-blue gradient to hero title" }

User speaks: "undo that"
→ You: revert the gradient change
→ Write result: { success: true, summary: "Reverted gradient on hero title" }
```
