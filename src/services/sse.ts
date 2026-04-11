import { supabase } from '../supabase';

type EventHandler = (data: any) => void;

export class SSEClient {
  private eventSource: EventSource | null = null;
  private listeners: Map<string, Set<EventHandler>> = new Map();
  private roomId: string;
  private reconnectTimer: any = null;

  constructor(roomId: string) {
    this.roomId = roomId;
  }

  async connect() {
    if (this.eventSource) return;

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error('Not authenticated');

      // Note: EventSource doesn't support custom headers natively in browser.
      // We have to pass the token in the URL query string.
      // We need to update auth.middleware.ts to check req.query.token as well.
      this.eventSource = new EventSource(`/api/rooms/${this.roomId}/events?token=${token}`);

      this.eventSource.onmessage = (event) => {
        // Default message handler (if not using named events)
        if (event.data === 'ping') return;
      };

      this.eventSource.addEventListener('message.new', (e: any) => {
        this.emit('message.new', JSON.parse(e.data));
      });

      this.eventSource.addEventListener('player.joined', (e: any) => {
        this.emit('player.joined', JSON.parse(e.data));
      });

      this.eventSource.addEventListener('player.updated', (e: any) => {
        this.emit('player.updated', JSON.parse(e.data));
      });

      this.eventSource.addEventListener('room.updated', (e: any) => {
        this.emit('room.updated', JSON.parse(e.data));
      });

      this.eventSource.onerror = (error) => {
        console.error('SSE Error:', error);
        this.disconnect();
        // Auto-reconnect
        this.reconnectTimer = setTimeout(() => this.connect(), 3000);
      };
    } catch (error) {
      console.error('Failed to connect SSE:', error);
    }
  }

  disconnect() {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  on(event: string, handler: EventHandler) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(handler);
  }

  off(event: string, handler: EventHandler) {
    const handlers = this.listeners.get(event);
    if (handlers) {
      handlers.delete(handler);
    }
  }

  private emit(event: string, data: any) {
    const handlers = this.listeners.get(event);
    if (handlers) {
      handlers.forEach(handler => handler(data));
    }
  }
}
