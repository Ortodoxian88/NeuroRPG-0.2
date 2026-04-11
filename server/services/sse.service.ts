import { Response } from 'express';

class SSEService {
  private clients: Map<string, Response[]> = new Map();

  subscribe(roomId: string, res: Response) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    if (!this.clients.has(roomId)) {
      this.clients.set(roomId, []);
    }
    this.clients.get(roomId)?.push(res);

    res.on('close', () => {
      const clients = this.clients.get(roomId);
      if (clients) {
        this.clients.set(roomId, clients.filter(client => client !== res));
      }
    });
  }

  broadcast(roomId: string, event: string, data: any) {
    const clients = this.clients.get(roomId);
    if (clients) {
      const deadClients: Response[] = [];
      clients.forEach(client => {
        try {
          client.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
        } catch (error) {
          console.error(`[SSE] Error broadcasting to client in room ${roomId}:`, error);
          deadClients.push(client);
        }
      });
      if (deadClients.length > 0) {
        this.clients.set(roomId, clients.filter(c => !deadClients.includes(c)));
      }
    }
  }
}

export const sseService = new SSEService();
