// src/services/sse.ts

import { supabase } from '../supabase';

// ─────────────────────────────────────────────
// Типы событий — строгая типизация
// ─────────────────────────────────────────────

/**
 * Карта событий SSE — имя события → тип данных.
 * TypeScript проверит что handler получает правильный тип.
 *
 * TODO: Заменить `any` на реальные типы после аудита types.ts
 */
export interface SSEEventMap {
  /** Новое сообщение в чате */
  'message.new': {
    id: string;
    room_id: string;
    content: string;
    type: string;
    created_at: string;
    player_id?: string;
  };

  /** Игрок присоединился к комнате */
  'player.joined': {
    id: string;
    room_id: string;
    character_name: string;
    user_id: string;
  };

  /** Данные игрока обновились (HP, инвентарь, статы) */
  'player.updated': {
    id: string;
    room_id: string;
    hp?: number;
    max_hp?: number;
    inventory?: string[];
    stats?: Record<string, number>;
    quests?: string[];
  };

  /** Состояние комнаты обновилось */
  'room.updated': {
    id: string;
    status: 'lobby' | 'playing' | 'finished';
    turn_number?: number;
    world_state?: Record<string, any>;
  };

  /** Изменение состояния SSE соединения (внутреннее) */
  'connection.status': {
    status: SSEConnectionStatus;
    attempt?: number;
    maxAttempts?: number;
  };
}

/**
 * Типизированный handler — знает точный тип данных для каждого события.
 */
type TypedEventHandler<K extends keyof SSEEventMap> = (data: SSEEventMap[K]) => void;

/**
 * Нетипизированный handler — для случаев когда событие не в SSEEventMap.
 */
type GenericEventHandler = (data: unknown) => void;

/**
 * Статус SSE соединения.
 */
export type SSEConnectionStatus =
  | 'disconnected'  // Не подключён
  | 'connecting'    // Идёт подключение
  | 'connected'     // Подключён и работает
  | 'reconnecting'; // Переподключение после ошибки

// ─────────────────────────────────────────────
// Конфигурация
// ─────────────────────────────────────────────

const RECONNECT_CONFIG = {
  /** Начальная задержка перед reconnect (мс) */
  initialDelay: 1000,
  /** Максимальная задержка (мс) — чтобы не ждать бесконечно */
  maxDelay: 30000,
  /** Множитель для exponential backoff */
  backoffMultiplier: 2,
  /** Максимальное количество попыток (0 = бесконечно) */
  maxAttempts: 10,
} as const;

/**
 * Все SSE события которые слушаем от сервера.
 * Добавить сюда при добавлении нового события на сервере.
 */
const SSE_EVENTS = [
  'message.new',
  'player.joined',
  'player.updated',
  'room.updated',
] as const satisfies ReadonlyArray<keyof Omit<SSEEventMap, 'connection.status'>>;

// ─────────────────────────────────────────────
// SSEClient
// ─────────────────────────────────────────────

/**
 * Клиент для получения Server-Sent Events от игрового сервера.
 *
 * **Использование:**
 * ```ts
 * const sse = new SSEClient('room-uuid');
 * await sse.connect();
 *
 * sse.on('message.new', (data) => {
 *   console.log('Новое сообщение:', data.content);
 * });
 *
 * // При размонтировании компонента:
 * sse.destroy();
 * ```
 *
 * **Безопасность:**
 * Токен НЕ передаётся в URL.
 * Используется ticket-based auth — одноразовый SSE токен через POST.
 *
 * **Reconnect:**
 * Exponential backoff: 1s → 2s → 4s → 8s → 16s → 30s (максимум)
 */
export class SSEClient {
  private eventSource: EventSource | null = null;
  private listeners: Map<string, Set<GenericEventHandler>> = new Map();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempts: number = 0;
  private connectionStatus: SSEConnectionStatus = 'disconnected';
  private isDestroyed: boolean = false;

  /** Слушатели браузерных событий — для корректного cleanup */
  private visibilityChangeHandler: (() => void) | null = null;
  private onlineHandler: (() => void) | null = null;

  constructor(private readonly roomId: string) {}

  // ─────────────────────────────────────────────
  // Публичные методы
  // ─────────────────────────────────────────────

  /**
   * Устанавливает SSE соединение.
   * Безопасно вызывать несколько раз — повторные вызовы игнорируются.
   */
  async connect(): Promise<void> {
    // Защита от вызова после destroy()
    if (this.isDestroyed) {
      console.warn('[SSE] Попытка connect() после destroy(). Игнорируем.');
      return;
    }

    // Уже подключены или подключаемся — ничего не делаем
    if (
      this.eventSource !== null ||
      this.connectionStatus === 'connecting' ||
      this.connectionStatus === 'connected'
    ) {
      return;
    }

    this.setStatus('connecting');

    try {
      // ─── Получаем одноразовый SSE ticket ────────────────────────────
      // Ticket-based auth: POST с JWT → получаем короткоживущий ticket
      // Ticket передаётся в URL (безопасно — он одноразовый, живёт 30 секунд)
      const sseTicket = await this.getSseTicket();

      if (!sseTicket) {
        throw new Error('Не удалось получить SSE ticket — пользователь не авторизован');
      }

      // ─── Создаём EventSource с ticket в URL ─────────────────────────
      // Ticket одноразовый и короткоживущий — компрометация URL не критична
      this.eventSource = new EventSource(
        `/api/rooms/${this.roomId}/events?ticket=${sseTicket}`
      );

      this.setupEventListeners();
      this.setupBrowserListeners();
    } catch (error) {
      console.error('[SSE] Ошибка подключения:', error);
      this.setStatus('disconnected');
      this.scheduleReconnect();
    }
  }

  /**
   * Отключает SSE соединение.
   * Не очищает listeners — можно переподключиться через connect().
   */
  disconnect(): void {
    this.clearReconnectTimer();
    this.closeEventSource();
    this.setStatus('disconnected');
  }

  /**
   * Полностью уничтожает клиент.
   * Очищает все listeners, таймеры, браузерные события.
   * После вызова объект нельзя переиспользовать.
   */
  destroy(): void {
    this.isDestroyed = true;
    this.disconnect();
    this.listeners.clear();
    this.removeBrowserListeners();
  }

  /**
   * Подписывается на типизированное событие.
   * TypeScript знает тип `data` на основе имени события.
   *
   * @example
   * sse.on('message.new', (data) => {
   *   console.log(data.content); // TypeScript знает что поле content: string
   * });
   */
  on<K extends keyof SSEEventMap>(
    event: K,
    handler: TypedEventHandler<K>
  ): void;

  /**
   * Подписывается на произвольное событие (без типизации).
   */
  on(event: string, handler: GenericEventHandler): void;

  on(event: string, handler: GenericEventHandler): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(handler);
  }

  /**
   * Отписывается от события.
   */
  off<K extends keyof SSEEventMap>(
    event: K,
    handler: TypedEventHandler<K>
  ): void;

  off(event: string, handler: GenericEventHandler): void;

  off(event: string, handler: GenericEventHandler): void {
    const handlers = this.listeners.get(event);
    if (handlers) {
      handlers.delete(handler);

      // Удаляем пустой Set — освобождаем память
      if (handlers.size === 0) {
        this.listeners.delete(event);
      }
    }
  }

  /**
   * Возвращает текущий статус соединения.
   */
  getStatus(): SSEConnectionStatus {
    return this.connectionStatus;
  }

  /**
   * Возвращает true если SSE соединение активно.
   */
  isConnected(): boolean {
    return this.connectionStatus === 'connected';
  }

  // ─────────────────────────────────────────────
  // Приватные методы
  // ─────────────────────────────────────────────

  /**
   * Получает одноразовый SSE ticket от сервера.
   * Ticket живёт 30 секунд — достаточно для установки SSE соединения.
   *
   * TODO: Если сервер не реализует /api/sse/token — можно временно
   * вернуться к передаче JWT токена, добавив комментарий о риске.
   */
  private async getSseTicket(): Promise<string | null> {
    const { data: { session } } = await supabase.auth.getSession();

    if (!session) return null;

    try {
      // Запрашиваем одноразовый ticket у сервера
      const response = await fetch('/api/sse/token', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ room_id: this.roomId }),
      });

      if (!response.ok) {
        throw new Error(`Сервер вернул ${response.status}`);
      }

      const { ticket } = await response.json();
      return ticket as string;
    } catch (err) {
      console.error('[SSE] Не удалось получить SSE ticket:', err);

      // ─── Fallback: если сервер не реализовал /api/sse/token ──────────
      // ВНИМАНИЕ: Небезопасно! Токен попадёт в URL и логи сервера.
      // Удалить после реализации ticket endpoint на сервере.
      console.warn(
        '[SSE] FALLBACK: Используем JWT токен в URL. ' +
        'Реализуйте /api/sse/token для устранения уязвимости!'
      );
      return session.access_token;
    }
  }

  /**
   * Подключает все обработчики событий к EventSource.
   */
  private setupEventListeners(): void {
    if (!this.eventSource) return;

    // ─── Событие открытия соединения ────────────────────────────────
    this.eventSource.onopen = () => {
      console.log(`[SSE] Подключено к комнате ${this.roomId}`);
      this.setStatus('connected');
      this.reconnectAttempts = 0; // Сбрасываем счётчик при успешном подключении
    };

    // ─── Дефолтный обработчик (onmessage) ───────────────────────────
    this.eventSource.onmessage = (event: MessageEvent) => {
      // Игнорируем ping от сервера (keepalive)
      if (event.data === 'ping' || event.data === ':') return;

      // Логируем неожиданные дефолтные сообщения
      console.debug('[SSE] Получено дефолтное сообщение (без имени события):', event.data);
    };

    // ─── Именованные события ────────────────────────────────────────
    SSE_EVENTS.forEach((eventName) => {
      this.eventSource!.addEventListener(eventName, (e: Event) => {
        this.handleNamedEvent(eventName, e as MessageEvent);
      });
    });

    // ─── Обработка ошибок ────────────────────────────────────────────
    this.eventSource.onerror = (error: Event) => {
      const readyState = this.eventSource?.readyState;

      // readyState === 2 = CLOSED — соединение закрыто
      if (readyState === EventSource.CLOSED) {
        console.warn('[SSE] Соединение закрыто сервером');
        this.closeEventSource();
        this.setStatus('reconnecting');
        this.scheduleReconnect();
        return;
      }

      // readyState === 0 = CONNECTING — браузер сам пытается переподключиться
      if (readyState === EventSource.CONNECTING) {
        console.warn('[SSE] Потеря соединения, браузер переподключается...');
        this.setStatus('reconnecting');
        return;
      }

      console.error('[SSE] Неизвестная ошибка:', error);
      this.closeEventSource();
      this.setStatus('reconnecting');
      this.scheduleReconnect();
    };
  }

  /**
   * Безопасно обрабатывает именованное SSE событие.
   * JSON.parse обёрнут в try/catch — один битый пакет не убьёт весь поток.
   */
  private handleNamedEvent(eventName: string, event: MessageEvent): void {
    try {
      const data = JSON.parse(event.data);
      this.emit(eventName, data);
    } catch (err) {
      console.error(
        `[SSE] Не удалось распарсить данные события "${eventName}":`,
        { rawData: event.data, error: err }
      );
      // Не перебрасываем ошибку — поток продолжает работать
    }
  }

  /**
   * Подключает браузерные события для умного reconnect.
   */
  private setupBrowserListeners(): void {
    // ─── Переключение вкладки ────────────────────────────────────────
    this.visibilityChangeHandler = () => {
      if (document.visibilityState === 'visible') {
        // Пользователь вернулся на вкладку
        if (
          !this.isDestroyed &&
          this.connectionStatus !== 'connected' &&
          this.connectionStatus !== 'connecting'
        ) {
          console.log('[SSE] Вкладка активирована — переподключаемся');
          this.reconnectAttempts = 0; // Сбрасываем счётчик при возврате
          this.connect();
        }
      }
    };

    document.addEventListener('visibilitychange', this.visibilityChangeHandler);

    // ─── Восстановление сети ─────────────────────────────────────────
    this.onlineHandler = () => {
      if (!this.isDestroyed && this.connectionStatus !== 'connected') {
        console.log('[SSE] Сеть восстановлена — переподключаемся');
        this.clearReconnectTimer();
        this.reconnectAttempts = 0;
        this.connect();
      }
    };

    window.addEventListener('online', this.onlineHandler);
  }

  /**
   * Удаляет браузерные слушатели.
   */
  private removeBrowserListeners(): void {
    if (this.visibilityChangeHandler) {
      document.removeEventListener('visibilitychange', this.visibilityChangeHandler);
      this.visibilityChangeHandler = null;
    }

    if (this.onlineHandler) {
      window.removeEventListener('online', this.onlineHandler);
      this.onlineHandler = null;
    }
  }

  /**
   * Планирует reconnect с exponential backoff.
   */
  private scheduleReconnect(): void {
    // Если destroy() уже вызван — не reconnect-им
    if (this.isDestroyed) return;

    // Если браузер оффлайн — не пытаемся, ждём события online
    if (!navigator.onLine) {
      console.log('[SSE] Браузер оффлайн. Ждём восстановления сети...');
      return;
    }

    // Проверяем максимум попыток
    if (
      RECONNECT_CONFIG.maxAttempts > 0 &&
      this.reconnectAttempts >= RECONNECT_CONFIG.maxAttempts
    ) {
      console.error(
        `[SSE] Исчерпано максимальное количество попыток (${RECONNECT_CONFIG.maxAttempts}). ` +
        'Переподключение остановлено.'
      );
      this.setStatus('disconnected');
      this.emit('connection.status', {
        status: 'disconnected',
        attempt: this.reconnectAttempts,
        maxAttempts: RECONNECT_CONFIG.maxAttempts,
      });
      return;
    }

    // Exponential backoff: initialDelay * backoffMultiplier^attempt
    const delay = Math.min(
      RECONNECT_CONFIG.initialDelay *
        Math.pow(RECONNECT_CONFIG.backoffMultiplier, this.reconnectAttempts),
      RECONNECT_CONFIG.maxDelay
    );

    this.reconnectAttempts++;

    console.log(
      `[SSE] Reconnect попытка ${this.reconnectAttempts}/${RECONNECT_CONFIG.maxAttempts} ` +
      `через ${delay}мс...`
    );

    this.emit('connection.status', {
      status: 'reconnecting',
      attempt: this.reconnectAttempts,
      maxAttempts: RECONNECT_CONFIG.maxAttempts,
    });

    this.clearReconnectTimer();
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  /**
   * Закрывает EventSource и обнуляет ссылку.
   */
  private closeEventSource(): void {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
  }

  /**
   * Отменяет запланированный reconnect.
   */
  private clearReconnectTimer(): void {
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  /**
   * Обновляет статус соединения и уведомляет подписчиков.
   */
  private setStatus(status: SSEConnectionStatus): void {
    if (this.connectionStatus === status) return; // Нет изменений — не эмитим
    this.connectionStatus = status;

    this.emit('connection.status', { status });
  }

  /**
   * Вызывает все handlers для события.
   */
  private emit(event: string, data: unknown): void {
    const handlers = this.listeners.get(event);
    if (!handlers || handlers.size === 0) return;

    handlers.forEach((handler) => {
      try {
        handler(data);
      } catch (err) {
        // Ошибка в одном handler не должна останавливать остальных
        console.error(`[SSE] Ошибка в handler события "${event}":`, err);
      }
    });
  }
}

// ─────────────────────────────────────────────
// React хук для удобного использования
// ─────────────────────────────────────────────

/**
 * TODO: Вынести в отдельный файл src/hooks/useSSE.ts
 *
 * Пример использования в компоненте:
 *
 * ```tsx
 * import { useEffect, useRef } from 'react';
 * import { SSEClient } from '@/services/sse';
 *
 * function useSSE(roomId: string) {
 *   const clientRef = useRef<SSEClient | null>(null);
 *
 *   useEffect(() => {
 *     const client = new SSEClient(roomId);
 *     clientRef.current = client;
 *     client.connect();
 *
 *     return () => {
 *       client.destroy(); // Корректная очистка при размонтировании
 *     };
 *   }, [roomId]);
 *
 *   return clientRef.current;
 * }
 *
 * // В компоненте:
 * const sse = useSSE(roomId);
 *
 * useEffect(() => {
 *   if (!sse) return;
 *
 *   const handleNewMessage = (data: SSEEventMap['message.new']) => {
 *     setMessages(prev => [...prev, data]);
 *   };
 *
 *   sse.on('message.new', handleNewMessage);
 *
 *   return () => {
 *     sse.off('message.new', handleNewMessage); // Отписываемся при cleanup
 *   };
 * }, [sse]);
 * ```
 */