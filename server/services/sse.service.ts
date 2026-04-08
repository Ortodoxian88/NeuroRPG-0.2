import { Response } from 'express';

class SSEService {
  private clients = new Map<string, Set<Response>>();

  constructor() {
    // Пинг каждые 20 секунд (Render обрывает пустые соединения через 30 сек)
    setInterval(() => {
      this.clients.forEach(room => {
        room.forEach(res => res.write(': ping\n\n'));
      });
    }, 20000);
  }

  subscribe(roomId: string, res: Response) {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform', // no-transform важен для сжатия
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no' // Важно для Nginx/Render
    });

    if (!this.clients.has(roomId)) {
      this.clients.set(roomId, new Set());
    }

    const roomClients = this.clients.get(roomId)!;
    roomClients.add(res);

    res.on('close', () => {
      roomClients.delete(res);
      if (roomClients.size === 0) this.clients.delete(roomId);
    });
  }

  broadcast(roomId: string, eventType: string, payload: any) {
    const roomClients = this.clients.get(roomId);
    if (!roomClients) return;

    const message = `event: ${eventType}\ndata: ${JSON.stringify(payload)}\n\n`;
    roomClients.forEach(res => res.write(message));
  }
}

export const sseService = new SSEService();
