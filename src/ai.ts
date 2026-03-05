import Anthropic from '@anthropic-ai/sdk';
import type { MurmurConfig } from './types.js';

const SYSTEM_PROMPT = `You are Murmur, an AI assistant that modifies frontend source code based on voice commands. The user is looking at their web application in a browser and describing changes they want to see.

You receive:
1. The current HTML of the rendered page (what the user sees)
2. The project's source files
3. A voice command from the user

Your job is to modify the source files to implement the user's request.

RESPONSE FORMAT:
Return your edits using this exact format. You may include multiple file edits.

To modify an existing file:

---FILE: path/to/file.ext
---SEARCH
exact lines to find in the file
---REPLACE
replacement lines
---END

To create a new file:

---FILE: path/to/new-file.ext
---CREATE
entire file content
---END

To delete a file:

---FILE: path/to/file.ext
---DELETE
---END

RULES:
1. The SEARCH block must match the file content EXACTLY, including whitespace and indentation
2. Make minimal, targeted changes - don't rewrite entire files unless necessary
3. Preserve the existing code style (indentation, quotes, semicolons, naming conventions, etc.)
4. When the user refers to visual elements ("that button", "the header"), map them to source code using the HTML context
5. You may edit multiple files in a single response
6. You may have multiple SEARCH/REPLACE blocks for the same file
7. After all edits, add a brief summary starting with "SUMMARY: " explaining what you changed

IMPORTANT:
- Keep changes focused on what the user asked for
- Don't add unsolicited improvements or refactoring
- If the user's request is ambiguous, make the most reasonable interpretation
- Match the project's existing patterns (CSS approach, component structure, naming, etc.)
- When creating new components, follow the same patterns as existing components
- Consider imports: add new imports when using new components/libraries`;

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export class AI {
  private history: Message[] = [];
  private provider: 'anthropic' | 'openai';
  private model: string;
  private anthropic: Anthropic | null = null;

  constructor(config: MurmurConfig) {
    this.provider = config.provider;

    if (config.provider === 'anthropic') {
      this.model = config.model || 'claude-sonnet-4-20250514';
      this.anthropic = new Anthropic();
    } else {
      this.model = config.model || 'gpt-4o';
    }
  }

  async processCommand(
    command: string,
    files: Map<string, string>,
    pageHtml: string,
  ): Promise<string> {
    const userMessage = this.buildUserMessage(command, files, pageHtml);
    this.history.push({ role: 'user', content: userMessage });

    let assistantMessage: string;

    if (this.provider === 'anthropic') {
      assistantMessage = await this.callAnthropic();
    } else {
      assistantMessage = await this.callOpenAI();
    }

    this.history.push({ role: 'assistant', content: assistantMessage });

    // Trim history to last 20 messages to manage tokens
    if (this.history.length > 20) {
      this.history = this.history.slice(-20);
    }

    return assistantMessage;
  }

  private async callAnthropic(): Promise<string> {
    if (!this.anthropic) throw new Error('Anthropic client not initialized');

    const response = await this.anthropic.messages.create({
      model: this.model,
      max_tokens: 8192,
      system: SYSTEM_PROMPT,
      messages: this.history.map((m) => ({
        role: m.role,
        content: m.content,
      })),
    });

    const block = response.content[0];
    if (block.type !== 'text') {
      throw new Error('Unexpected response type from Anthropic');
    }
    return block.text;
  }

  private async callOpenAI(): Promise<string> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error('OPENAI_API_KEY not set');

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: 8192,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          ...this.history.map((m) => ({ role: m.role, content: m.content })),
        ],
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`OpenAI API error ${response.status}: ${text}`);
    }

    const data = (await response.json()) as {
      choices: Array<{ message: { content: string } }>;
    };
    return data.choices[0].message.content;
  }

  private buildUserMessage(
    command: string,
    files: Map<string, string>,
    pageHtml: string,
  ): string {
    const parts: string[] = [];

    // Include a truncated version of the page HTML for visual context
    if (pageHtml) {
      const maxHtmlLen = 60_000;
      const truncated =
        pageHtml.length > maxHtmlLen
          ? pageHtml.slice(0, maxHtmlLen) + '\n<!-- ... truncated -->'
          : pageHtml;
      parts.push(`## Current Page HTML (what the user sees)\n\`\`\`html\n${truncated}\n\`\`\``);
    }

    // Include project source files
    parts.push(`## Project Source Files\n`);
    for (const [filePath, content] of files) {
      const ext = filePath.split('.').pop() || '';
      parts.push(`### ${filePath}\n\`\`\`${ext}\n${content}\n\`\`\``);
    }

    // Include the voice command
    parts.push(`## Voice Command\nThe user said: "${command}"`);

    return parts.join('\n\n');
  }

  clearHistory(): void {
    this.history = [];
  }
}
