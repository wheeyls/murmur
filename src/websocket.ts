import { WebSocketServer, WebSocket } from 'ws';
import type http from 'node:http';
import type { WSMessage, WSCommandMessage, WSStatusMessage } from './types.js';

type CommandHandler = (msg: WSCommandMessage) => Promise<void>;
type UndoHandler = () => Promise<void>;

export class MurmurWebSocket {
  private wss: WebSocketServer;
  private clients: Set<WebSocket> = new Set();
  private onCommand: CommandHandler;
  private onUndo: UndoHandler;

  constructor(server: http.Server, onCommand: CommandHandler, onUndo: UndoHandler) {
    this.onCommand = onCommand;
    this.onUndo = onUndo;
    this.wss = new WebSocketServer({ noServer: true });

    server.on('murmur-ws-upgrade', (req: http.IncomingMessage, socket: unknown, head: Buffer) => {
      this.wss.handleUpgrade(req, socket as any, head, (ws) => {
        this.wss.emit('connection', ws, req);
      });
    });

    this.wss.on('connection', (ws) => {
      this.clients.add(ws);

      ws.on('close', () => {
        this.clients.delete(ws);
      });

      ws.on('message', (data) => {
        try {
          const msg: WSMessage = JSON.parse(data.toString());
          this.handleMessage(msg);
        } catch {
          // malformed message
        }
      });
    });
  }

  private async handleMessage(msg: WSMessage): Promise<void> {
    switch (msg.type) {
      case 'command':
        await this.onCommand(msg as WSCommandMessage);
        break;
      case 'undo':
        await this.onUndo();
        break;
    }
  }

  broadcast(msg: WSStatusMessage | { type: string; [key: string]: unknown }): void {
    const data = JSON.stringify(msg);
    for (const client of this.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(data);
      }
    }
  }

  sendReload(): void {
    this.broadcast({ type: 'reload' });
  }
}
