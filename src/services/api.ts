// src/services/api.ts

import { supabase } from '../supabase';

// ─────────────────────────────────────────────
// Типы (пока импортируем из types.ts, когда увижу его)
// ─────────────────────────────────────────────

// TODO: Заменить на реальные импорты после аудита types.ts
type RoomRow = any; // import { RoomRow } from '@/src/types';
type PlayerRow = any;
type MessageRow = any;
type BestiaryEntry = any;

/**
 * Тип сообщения в чате — только валидные значения.
 */
export type MessageType =
  | 'player_action'
  | 'ai_response'
  | 'system'
  | 'join'
  | 'leave'
  | 'dice_roll';

/**
 * Данные персонажа при создании.
 */
export interface CharacterData {
  name: string;
  race: string;
  characterClass: string;
  background?: string;
  appearance?: string;
  personality?: string;
  goals?: string;
}

/**
 * Частичное обновление игрока.
 */
export interface PlayerUpdate {
  hp?: number;
  max_hp?: number;
  inventory?: string[];
  stats?: Record<string, number>;
  quests?: string[];
  notes?: string;
}

/**
 * Ответ от AI при генерации хода.
 */
export interface GenerateTurnResponse {
  narration: string;
  playerUpdates?: Record<string, PlayerUpdate>;
  worldUpdate?: any;
}

/**
 * Кандидат для занесения в бестиарий.
 */
export interface ArchivistCandidate {
  name: string;
  description: string;
  context: string;
}

// ─────────────────────────────────────────────
// Конфигурация
// ─────────────────────────────────────────────

const API_URL = '/api';

/**
 * Настройки retry логики.
 */
const RETRY_CONFIG = {
  /** Количество попыток при сетевых ошибках */
  maxRetries: 3,
  /** Начальная задержка в мс */
  initialDelay: 1000,
  /** Множитель задержки (exponential backoff) */
  backoffMultiplier: 2,
} as const;

// ─────────────────────────────────────────────
// Кэш токена авторизации
// ─────────────────────────────────────────────

/**
 * Кэш токена — обновляется только при истечении или logout.
 * Защищает от 100 вызовов getSession() при параллельных запросах.
 */
let cachedToken: string | null = null;
let tokenExpiresAt: number | null = null;

/**
 * Подписка на изменения сессии в Supabase — сбрасывает кэш при logout/refresh.
 */
supabase.auth.onAuthStateChange((event, session) => {
  if (event === 'SIGNED_OUT' || event === 'TOKEN_REFRESHED') {
    cachedToken = null;
    tokenExpiresAt = null;
  }

  if (session) {
    cachedToken = session.access_token;
    // JWT обычно живёт 1 час, вычитаем 5 минут запаса
    tokenExpiresAt = (session.expires_at ?? 0) * 1000 - 5 * 60 * 1000;
  }
});

/**
 * Получает валидный access token.
 * Использует кэш если токен ещё не протух, иначе запрашивает новый.
 *
 * @throws {ApiError} Если пользователь не авторизован
 */
async function getAccessToken(): Promise<string> {
  const now = Date.now();

  // Если есть закэшированный токен и он не протух — используем его
  if (cachedToken && tokenExpiresAt && now < tokenExpiresAt) {
    return cachedToken;
  }

  // Иначе запрашиваем свежий токен у Supabase
  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();

  if (error || !session) {
    throw new ApiError('NOT_AUTHENTICATED', 'Необходима авторизация', 401);
  }

  cachedToken = session.access_token;
  tokenExpiresAt = (session.expires_at ?? 0) * 1000 - 5 * 60 * 1000;

  return cachedToken;
}

// ─────────────────────────────────────────────
// Обработка ошибок
// ─────────────────────────────────────────────

/**
 * Кастомная ошибка API с дополнительным контекстом.
 * Содержит HTTP статус, код ошибки и детали от сервера.
 */
export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
    public details?: any
  ) {
    super(message);
    this.name = 'ApiError';

    // Сохраняем правильный стек вызовов (для V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, ApiError);
    }
  }

  /**
   * Проверяет является ли ошибка ошибкой авторизации.
   */
  isAuthError(): boolean {
    return this.status === 401 || this.status === 403;
  }

  /**
   * Проверяет является ли ошибка сетевой (нет интернета, таймаут).
   */
  isNetworkError(): boolean {
    return this.code === 'NETWORK_ERROR' || this.code === 'TIMEOUT';
  }
}

/**
 * Обрабатывает fetch Response и выбрасывает ApiError при ошибке.
 */
async function handleResponse<T>(response: Response): Promise<T> {
  const contentType = response.headers.get('content-type');
  const isJSON = contentType?.includes('application/json');

  // Если ответ успешный — парсим JSON
  if (response.ok) {
    if (!isJSON) {
      console.warn(
        `[API] Ожидали JSON, получили ${contentType}. URL: ${response.url}`
      );
      // Возвращаем пустой объект — сервер может вернуть 204 No Content
      return {} as T;
    }

    try {
      return await response.json();
    } catch (err) {
      throw new ApiError(
        'PARSE_ERROR',
        'Не удалось распарсить ответ сервера',
        response.status,
        { originalError: err }
      );
    }
  }

  // Ответ с ошибкой — извлекаем детали
  let errorDetails: any = null;

  if (isJSON) {
    try {
      errorDetails = await response.json();
    } catch {
      // Если JSON битый — игнорируем
    }
  } else {
    // Сервер вернул HTML/текст (часто при 500)
    try {
      errorDetails = await response.text();
    } catch {
      // Игнорируем
    }
  }

  const errorMessage =
    errorDetails?.message ??
    errorDetails?.error ??
    response.statusText ??
    'Неизвестная ошибка сервера';

  const errorCode = errorDetails?.code ?? `HTTP_${response.status}`;

  throw new ApiError(errorCode, errorMessage, response.status, errorDetails);
}

/**
 * Sleep для retry логики.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─────────────────────────────────────────────
// Базовая обёртка fetch
// ─────────────────────────────────────────────

interface FetchOptions extends RequestInit {
  /** Включить retry при сетевых ошибках */
  retry?: boolean;
  /** Кастомный таймаут в мс (по умолчанию 30 секунд) */
  timeout?: number;
}

/**
 * Универсальная обёртка для всех API запросов.
 * Автоматически добавляет Authorization header, обрабатывает ошибки, делает retry.
 *
 * @param endpoint - Путь эндпоинта (например, '/rooms')
 * @param options - Опции fetch + retry/timeout
 */
async function fetchAPI<T>(endpoint: string, options: FetchOptions = {}): Promise<T> {
  const { retry = true, timeout = 30000, ...fetchOptions } = options;

  // Получаем токен
  const token = await getAccessToken();

  // Формируем финальные headers
  const headers = new Headers(fetchOptions.headers);
  headers.set('Authorization', `Bearer ${token}`);
  headers.set('Content-Type', 'application/json');

  const url = `${API_URL}${endpoint}`;

  // ─── Retry логика ────────────────────────────────────────────────

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= RETRY_CONFIG.maxRetries; attempt++) {
    const isRetry = attempt > 0;

    try {
      // AbortController для таймаута
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      const response = await fetch(url, {
        ...fetchOptions,
        headers,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      // Обрабатываем ответ
      return await handleResponse<T>(response);
    } catch (err: any) {
      lastError = err;

      // ─── Определяем нужен ли retry ────────────────────────────────

      // Не делаем retry для ошибок авторизации — это не поможет
      if (err instanceof ApiError && err.isAuthError()) {
        // При 401 — редиректим на логин (делегируем App.tsx)
        if (err.status === 401) {
          console.warn('[API] 401 Unauthorized — требуется повторный вход');
          // Можно добавить глобальный event bus для logout
          window.dispatchEvent(new CustomEvent('api:unauthorized'));
        }
        throw err;
      }

      // Не делаем retry для клиентских ошибок (400, 404, 422) — это бесполезно
      if (err instanceof ApiError && err.status >= 400 && err.status < 500) {
        throw err;
      }

      // Не делаем retry если это отключено
      if (!retry) {
        throw err;
      }

      // Не делаем retry на последней попытке
      if (attempt === RETRY_CONFIG.maxRetries) {
        throw err;
      }

      // ─── Сетевая ошибка или 5xx — делаем retry ────────────────────

      const isNetworkError =
        err.name === 'AbortError' || // Timeout
        err.name === 'TypeError' || // Network failure (нет интернета)
        (err instanceof ApiError && err.status >= 500); // Server error

      if (isNetworkError) {
        const delay =
          RETRY_CONFIG.initialDelay * Math.pow(RETRY_CONFIG.backoffMultiplier, attempt);

        console.warn(
          `[API] Retry ${attempt + 1}/${RETRY_CONFIG.maxRetries} после ${delay}ms. Причина: ${err.message}`
        );

        await sleep(delay);
        continue; // Повторяем запрос
      }

      // Неизвестная ошибка — не ретраим
      throw err;
    }
  }

  // Если дошли сюда — все попытки исчерпаны
  throw new ApiError(
    'MAX_RETRIES_EXCEEDED',
    `Не удалось выполнить запрос после ${RETRY_CONFIG.maxRetries} попыток`,
    0,
    { lastError }
  );
}

// ─────────────────────────────────────────────
// API методы
// ─────────────────────────────────────────────

export const api = {
  // ─── Rooms ─────────────────────────────────────────────────────────

  /**
   * Создаёт новую игровую комнату.
   *
   * @param scenario - Описание стартового сценария
   * @returns Созданная комната
   */
  async createRoom(scenario: string): Promise<RoomRow> {
    return fetchAPI<RoomRow>('/rooms', {
      method: 'POST',
      body: JSON.stringify({ scenario }),
    });
  },

  /**
   * Получает список всех комнат текущего пользователя.
   *
   * @returns Массив комнат
   */
  async getRooms(): Promise<RoomRow[]> {
    return fetchAPI<RoomRow[]>('/rooms');
  },

  /**
   * Получает детальную информацию о комнате.
   *
   * @param roomId - UUID комнаты или join_code
   * @returns Детали комнаты
   */
  async getRoom(roomId: string): Promise<RoomRow> {
    return fetchAPI<RoomRow>(`/rooms/${roomId}`);
  },

  /**
   * Присоединяется к комнате по коду.
   *
   * @param joinCode - 6-символьный код комнаты (например, "ABC123")
   * @param characterData - Данные персонажа
   * @returns Информация о созданном игроке
   */
  async joinRoom(joinCode: string, characterData: CharacterData): Promise<PlayerRow> {
    return fetchAPI<PlayerRow>('/rooms/join', {
      method: 'POST',
      body: JSON.stringify({ joinCode, ...characterData }),
    });
  },

  // ─── Players ───────────────────────────────────────────────────────

  /**
   * Получает список всех игроков в комнате.
   *
   * @param roomId - UUID комнаты
   * @returns Массив игроков
   */
  async getPlayers(roomId: string): Promise<PlayerRow[]> {
    return fetchAPI<PlayerRow[]>(`/rooms/${roomId}/players`);
  },

  /**
   * Отправляет действие игрока.
   *
   * @param roomId - UUID комнаты
   * @param action - Текст действия (например, "Атакую орка мечом")
   * @param isHidden - Скрытое действие (видно только GM)
   * @returns Результат обработки действия
   */
  async submitAction(
    roomId: string,
    action: string,
    isHidden: boolean = false
  ): Promise<GenerateTurnResponse> {
    return fetchAPI<GenerateTurnResponse>(`/rooms/${roomId}/players/action`, {
      method: 'POST',
      body: JSON.stringify({ action, isHidden }),
    });
  },

  /**
   * Обновляет данные игрока (HP, инвентарь, статы).
   *
   * @param roomId - UUID комнаты
   * @param updates - Частичное обновление полей игрока
   * @returns Обновлённый игрок
   */
  async updatePlayer(roomId: string, updates: PlayerUpdate): Promise<PlayerRow> {
    return fetchAPI<PlayerRow>(`/rooms/${roomId}/players/update`, {
      method: 'POST',
      body: JSON.stringify(updates),
    });
  },

  // ─── Messages ──────────────────────────────────────────────────────

  /**
   * Получает историю сообщений в комнате.
   *
   * @param roomId - UUID комнаты
   * @param limit - Количество сообщений (по умолчанию 50)
   * @param offset - Смещение для пагинации
   * @returns Массив сообщений (от новых к старым)
   */
  async getMessages(
    roomId: string,
    limit: number = 50,
    offset: number = 0
  ): Promise<MessageRow[]> {
    // Валидация — только положительные целые числа
    const safeLimit = Math.max(1, Math.min(Math.floor(limit), 200)); // Макс 200
    const safeOffset = Math.max(0, Math.floor(offset));

    return fetchAPI<MessageRow[]>(
      `/rooms/${roomId}/messages?limit=${safeLimit}&offset=${safeOffset}`
    );
  },

  /**
   * Отправляет сообщение в чат комнаты.
   *
   * @param roomId - UUID комнаты
   * @param content - Текст сообщения
   * @param type - Тип сообщения
   * @param turn_number - Номер хода (опционально)
   * @returns Созданное сообщение
   */
  async sendMessage(
    roomId: string,
    content: string,
    type: MessageType = 'player_action',
    turn_number?: number
  ): Promise<MessageRow> {
    return fetchAPI<MessageRow>(`/rooms/${roomId}/messages`, {
      method: 'POST',
      body: JSON.stringify({ content, type, turn_number }),
    });
  },

  // ─── AI / Gemini ───────────────────────────────────────────────────

  /**
   * Генерирует вступительное повествование при присоединении к комнате.
   *
   * @param characterName - Имя персонажа
   * @param characterProfile - Описание персонажа (раса, класс, бэкграунд)
   * @param roomId - UUID комнаты (опционально, для контекста)
   * @returns Текст вступления от AI
   */
  async generateJoin(
    characterName: string,
    characterProfile: string,
    roomId?: string
  ): Promise<{ narration: string }> {
    return fetchAPI<{ narration: string }>('/gemini/join', {
      method: 'POST',
      body: JSON.stringify({ characterName, characterProfile, roomId }),
      // Gemini может отвечать долго — увеличиваем таймаут
      timeout: 60000,
    });
  },

  /**
   * Генерирует AI ответ на действия игроков (основной игровой цикл).
   *
   * @param roomId - UUID комнаты
   * @param payload - Контекст для генерации (история, статы игроков, мир)
   * @returns Повествование + изменения в мире/игроках
   */
  async generateTurn(roomId: string, payload: any): Promise<GenerateTurnResponse> {
    return fetchAPI<GenerateTurnResponse>('/gemini/generate', {
      method: 'POST',
      body: JSON.stringify({ roomId, ...payload }),
      // Генерация хода может быть долгой
      timeout: 60000,
    });
  },

  /**
   * Генерирует саммари истории для сжатия контекста.
   *
   * @param roomId - UUID комнаты
   * @param currentSummary - Текущее саммари
   * @param recentMessages - Новые сообщения для добавления в саммари
   * @returns Обновлённое саммари
   */
  async summarize(
    roomId: string,
    currentSummary: string,
    recentMessages: string
  ): Promise<{ summary: string }> {
    return fetchAPI<{ summary: string }>('/gemini/summarize', {
      method: 'POST',
      body: JSON.stringify({ roomId, currentSummary, recentMessages }),
      timeout: 60000,
    });
  },

  // ─── Bestiary ──────────────────────────────────────────────────────

  /**
   * Получает записи из бестиария с фильтрацией.
   *
   * @param search - Поисковый запрос по имени/описанию
   * @param category - Фильтр по категории (существо, локация, предмет и т.д.)
   * @returns Массив записей бестиария
   */
  async getBestiary(search: string = '', category: string = ''): Promise<BestiaryEntry[]> {
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    if (category) params.set('category', category);

    const query = params.toString();
    return fetchAPI<BestiaryEntry[]>(`/bestiary${query ? `?${query}` : ''}`);
  },

  /**
   * Обрабатывает кандидатов для добавления в бестиарий.
   * AI решает что достойно занесения в архив, генерирует описания.
   *
   * @param roomId - UUID комнаты
   * @param candidates - Массив кандидатов (имя, описание, контекст)
   * @returns Обработанные записи (могут быть объединены/отфильтрованы AI)
   */
  async processArchivist(
    roomId: string,
    candidates: ArchivistCandidate[]
  ): Promise<BestiaryEntry[]> {
    return fetchAPI<BestiaryEntry[]>('/gemini/archivist', {
      method: 'POST',
      body: JSON.stringify({ roomId, candidates }),
      timeout: 60000,
    });
  },
};

// ─────────────────────────────────────────────
// Экспорт типов для использования в компонентах
// ─────────────────────────────────────────────

export type { CharacterData, PlayerUpdate, GenerateTurnResponse, ArchivistCandidate };