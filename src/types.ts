// src/types.ts

/**
 * @fileoverview
 * Типы данных для NeuroRPG.
 * 
 * ВАЖНО:
 * - RoomRow/PlayerRow/MessageRow — типы данных из БД (snake_case)
 * - Room/Player/Message — клиентские интерфейсы с дополнительными полями (camelCase)
 * - При добавлении полей в БД — обновить соответствующий *Row тип
 */

// ─────────────────────────────────────────────
// Базовые типы
// ─────────────────────────────────────────────

/**
 * ISO 8601 timestamp строка.
 * Пример: "2024-01-15T12:34:56.789Z"
 */
export type ISOTimestamp = string;

/**
 * UUID v4 строка.
 * Пример: "550e8400-e29b-41d4-a716-446655440000"
 */
export type UUID = string;

/**
 * 6-символьный код комнаты (uppercase буквы + цифры).
 * Пример: "ABC123"
 */
export type JoinCode = string;

// ─────────────────────────────────────────────
// БД: Rooms
// ─────────────────────────────────────────────

/**
 * Статус игровой комнаты.
 */
export type RoomStatus = 'lobby' | 'playing' | 'finished';

/**
 * Настройки мира/сценария.
 * Хранятся как JSONB в БД.
 */
export interface WorldSettings {
  /** Стартовое описание сценария */
  scenario: string;
  /** Максимум игроков в комнате */
  max_players: number;
  /** Тон ГМ (опционально, по умолчанию 'classic') */
  gm_tone?: 'classic' | 'grimdark' | 'horror' | 'epic';
  /** Сложность (опционально, по умолчанию 'normal') */
  difficulty?: 'normal' | 'hard' | 'hardcore';
}

/**
 * Состояние мира (динамическая информация).
 * Хранится как JSONB, обновляется AI.
 */
export interface WorldState {
  /** Глобальная экономика, валюты, цены */
  economy?: Record<string, number>;
  /** Погода, время суток, сезон */
  environment?: string;
  /** Важные NPC и их локации */
  npcs?: Record<string, string>;
  /** Произошедшие глобальные события */
  events?: string[];
}

/**
 * Отношения с фракциями.
 * Ключ — название фракции, значение — отношение (-100 до 100).
 */
export type FactionRelations = Record<string, number>;

/**
 * Скрытые таймеры для квестов/событий.
 * Ключ — ID события, значение — осталось ходов.
 * Пример: { "save_hostage": 3, "poison_spreads": 5 }
 */
export type HiddenTimers = Record<string, number>;

/**
 * Прямая схема таблицы `rooms` из БД (snake_case).
 * Все поля как в PostgreSQL.
 */
export interface RoomRow {
  id: UUID;
  join_code: JoinCode;
  host_id: UUID;
  status: RoomStatus;
  turn_number: number;
  world_settings: WorldSettings;
  world_state?: WorldState;
  story_summary?: string;
  last_summary_turn?: number;
  faction_relations?: FactionRelations;
  hidden_timers?: HiddenTimers;
  created_at: ISOTimestamp;
  updated_at: ISOTimestamp;
}

/**
 * Клиентский интерфейс комнаты с дополнительными полями для UI.
 * НЕ хранится в БД — используется только во фронтенде.
 */
export interface Room extends Omit<RoomRow, 'turn_number' | 'world_settings' | 'world_state'> {
  /** Номер хода (переименовано для удобства) */
  turn: number;
  /** Настройки мира */
  worldSettings: WorldSettings;
  /** Состояние мира */
  worldState?: WorldState;
  
  // ─── UI состояние (не из БД) ───────────────────────────────────────
  
  /** Генерируется ли AI ответ прямо сейчас (для спиннера) */
  isGenerating?: boolean;
  /** Текущий результат броска кубика (для анимации) */
  currentRoll?: DiceRoll | null;
}

/**
 * Результат броска кубика.
 */
export interface DiceRoll {
  playerUid: UUID;
  playerName: string;
  value: number;
  timestamp: number;
}

// ─────────────────────────────────────────────
// БД: Players
// ─────────────────────────────────────────────

/**
 * Характеристики персонажа (D&D-подобные).
 */
export interface PlayerStats {
  /** Скорость передвижения (0-100) */
  speed: number;
  /** Скорость реакции (0-100) */
  reaction: number;
  /** Сила (подъём тяжестей) (0-100) */
  strength: number;
  /** Разрушительная сила (урон) (0-100) */
  power: number;
  /** Прочность (сопротивление урону) (0-100) */
  durability: number;
  /** Выносливость (длительность активности) (0-100) */
  stamina: number;
}

/**
 * Прямая схема таблицы `players` из БД (snake_case).
 */
export interface PlayerRow {
  id: UUID;
  room_id: UUID;
  user_id: UUID;
  character_name: string;
  character_profile: string;
  hp: number;
  max_hp: number;
  mana: number;
  max_mana: number;
  stress: number; // 0-100
  alignment?: string; // "Хаотично-Добрый", "Законно-Злой", etc.
  inventory: string[]; // JSONB array
  skills: string[]; // JSONB array
  injuries?: string[]; // JSONB array
  statuses?: string[]; // Временные эффекты: "Отравлен", "Кровотечение"
  mutations?: string[]; // Постоянные изменения: "Регенерация", "Ночное зрение"
  reputation?: FactionRelations; // JSONB — отношения с фракциями
  stats: PlayerStats; // JSONB
  current_action?: string; // Последнее введённое действие
  is_hidden_action: boolean; // Действие видно только ГМ
  is_ready: boolean; // Готов к следующему ходу
  joined_at: ISOTimestamp;
  updated_at: ISOTimestamp;
}

/**
 * Клиентский интерфейс игрока (camelCase для удобства).
 */
export interface Player extends Omit<PlayerRow, 'character_name' | 'character_profile' | 'current_action' | 'is_hidden_action' | 'is_ready'> {
  name: string;
  profile: string;
  action?: string;
  isHiddenAction: boolean;
  isReady: boolean;
}

// ─────────────────────────────────────────────
// БД: Messages
// ─────────────────────────────────────────────

/**
 * Тип сообщения в чате.
 */
export type MessageType =
  | 'player_action' // Действие игрока
  | 'ai_response'   // Ответ AI (GM)
  | 'system'        // Системное сообщение
  | 'join'          // Игрок присоединился
  | 'leave'         // Игрок покинул комнату
  | 'dice_roll';    // Результат броска кубика

/**
 * Прямая схема таблицы `messages` из БД.
 */
export interface MessageRow {
  id: UUID;
  room_id: UUID;
  player_id?: UUID; // null для AI/системных сообщений
  type: MessageType;
  content: string;
  reasoning?: string; // Внутренняя логика AI (не показывается игрокам)
  is_hidden: boolean; // Видно только GM/игроку отправителю
  turn_number: number;
  created_at: ISOTimestamp;
}

/**
 * Клиентский интерфейс сообщения с дополнительными полями.
 */
export interface Message extends Omit<MessageRow, 'player_id' | 'turn_number' | 'is_hidden'> {
  /** Имя игрока (заполняется фронтендом при рендере) */
  playerName?: string;
  /** UID игрока (переименовано из player_id) */
  playerUid?: UUID;
  /** Скрыто ли сообщение */
  isHidden: boolean;
  /** Номер хода */
  turn: number;
  
  /**
   * @deprecated Используйте `type` вместо `role`
   * Оставлено для обратной совместимости со старым кодом.
   */
  role?: 'system' | 'ai' | 'players' | 'player';
}

// ─────────────────────────────────────────────
// БД: Bestiary
// ─────────────────────────────────────────────

/**
 * Категория записи в бестиарии.
 */
export type BestiaryCategory =
  | 'creature' // Монстры, NPC
  | 'location' // Локации
  | 'item'     // Артефакты
  | 'lore'     // Знания
  | 'faction'  // Организации
  | 'event';   // События

/**
 * Природа записи (для UI фильтров).
 */
export type BestiaryNature = 'positive' | 'negative' | 'neutral';

/**
 * Уровень знания о записи.
 * 1 — Слухи (минимум информации)
 * 2 — Столкновение (базовая информация)
 * 3 — Изучение (детальная информация)
 */
export type KnowledgeLevel = 1 | 2 | 3;

/**
 * Прямая схема таблицы `bestiary` из БД.
 */
export interface BestiaryRow {
  id: UUID;
  room_id: UUID;
  title: string;
  category: BestiaryCategory;
  nature?: BestiaryNature;
  tags: string[]; // JSONB array
  knowledge_level: KnowledgeLevel;
  content: string;
  author_notes?: string; // Личные заметки игрока
  discovered_by: UUID; // User ID
  discovered_at: ISOTimestamp;
  updated_at: ISOTimestamp;
}

/**
 * Клиентский интерфейс записи бестиария.
 */
export interface BestiaryEntry extends Omit<BestiaryRow, 'knowledge_level' | 'discovered_by' | 'discovered_at' | 'author_notes'> {
  level: KnowledgeLevel;
  discoveredBy: UUID;
  discoveredAt: ISOTimestamp;
  authorNotes?: string;
}

/**
 * Кандидат для занесения в бестиарий (от AI).
 * Используется в archivist.ts перед сохранением в БД.
 */
export interface ArchivistCandidate {
  /** Название сущности */
  name: string;
  /** Сырые факты из игрового контекста */
  description: string;
  /** Контекст обнаружения */
  context: string;
}

// ─────────────────────────────────────────────
// Настройки приложения
// ─────────────────────────────────────────────

/**
 * Глобальные настройки приложения.
 * Хранятся в localStorage.
 */
export interface AppSettings {
  // ─── Геймплей ──────────────────────────────────────────────────────
  
  /** Уровень жестокости (gore) в описаниях AI */
  goreLevel: 'low' | 'medium' | 'high';
  /** Тон Гейм-мастера */
  gmTone: 'classic' | 'grimdark' | 'horror' | 'epic';
  /** Сложность игры */
  difficulty: 'normal' | 'hard' | 'hardcore';
  
  // ─── Внешний вид ───────────────────────────────────────────────────
  
  /** Тема интерфейса */
  theme: 'light' | 'dark' | 'black';
  /** Язык интерфейса */
  language: 'ru' | 'en';
  
  // ─── Эффекты и обратная связь ──────────────────────────────────────
  
  /** Звуковые эффекты */
  soundEffects: boolean;
  /** Вибрация (haptic feedback) */
  vibration: boolean;
  /** Анимации интерфейса */
  animations: boolean;
  /** Режим производительности (отключает тяжёлые эффекты) */
  performanceMode: boolean;
  /** URL фоновой музыки (необязательно) */
  localMusicUrl?: string;
}

/**
 * Настройки чата.
 * Хранятся в localStorage отдельно от AppSettings.
 */
export interface ChatSettings {
  // ─── Типографика ───────────────────────────────────────────────────
  
  /** Семейство шрифтов */
  fontFamily: 'sans' | 'serif' | 'mono' | 'dyslexic';
  /** Размер шрифта */
  fontSize: 'sm' | 'md' | 'lg';
  /** Высота строки */
  lineHeight: 'tight' | 'normal' | 'loose';
  /** Интервал между буквами */
  tracking: 'tight' | 'normal' | 'wide';
  /** Выделять имена игроков жирным */
  boldNames: boolean;
  /** Действия курсивом */
  italicActions: boolean;
  /** Подсвечивать ключевые слова (лут, места) */
  highlightKeywords: boolean;
  /** Выравнивание текста */
  textAlign: 'left' | 'justify';
  /** Автокапитализация первой буквы */
  autoCapitalize: boolean;
  
  // ─── Отображение ───────────────────────────────────────────────────
  
  /** Скорость эффекта печатной машинки (мс на символ, 0 = мгновенно) */
  typewriterSpeed: number;
  /** Стиль сообщений */
  messageStyle: 'bubbles' | 'plain';
  /** Компактный режим (меньше отступов) */
  compactMode: boolean;
  /** Показывать время отправки */
  showTimestamps: boolean;
  /** Размер аватарок */
  avatarSize: 'hidden' | 'sm' | 'md' | 'lg';
  /** Скрыть системные сообщения */
  hideSystemMessages: boolean;
  
  // ─── Цвета ─────────────────────────────────────────────────────────
  
  /** Цветовое кодирование игроков */
  playerColors: boolean;
  /** Цвет текста AI */
  aiTextColor: 'default' | 'gold' | 'purple' | 'green';
  /** Стиль границ */
  borderStyle: 'sharp' | 'rounded' | 'fantasy';
  /** Интенсивность теней */
  shadowIntensity: 'none' | 'sm' | 'md' | 'lg';
  /** Цвет ссылок */
  linkColor: 'blue' | 'orange' | 'purple';
  /** Цвет шёпота */
  whisperColor: 'gray' | 'purple' | 'blue';
  /** Цвет ошибок */
  errorColor: 'red' | 'orange';
  
  // ─── Поведение ─────────────────────────────────────────────────────
  
  /** Автопрокрутка к новым сообщениям */
  autoScroll: boolean;
  /** Плавная прокрутка */
  smoothScroll: boolean;
  /** Поддержка Markdown в сообщениях */
  enableMarkdown: boolean;
  /** Режим фокуса (затемнять старые сообщения) */
  focusMode: boolean;
}

// ─────────────────────────────────────────────
// Утилиты и вспомогательные типы
// ─────────────────────────────────────────────

/**
 * Маппинг snake_case → camelCase для типов БД.
 * Используется в api.ts для трансформации данных.
 */
export type CamelCase<S extends string> = S extends `${infer P}_${infer Q}`
  ? `${P}${Capitalize<CamelCase<Q>>}`
  : S;

/**
 * Partial тип с глубокой рекурсией.
 * Используется для обновления вложенных объектов.
 */
export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};