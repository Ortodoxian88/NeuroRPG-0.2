// server/database/types.ts
// Полные типы для всего проекта NeuroRPG

// ─── Игровые enum'ы и константы ──────────────────────────────────────────────

export type RoomStatus = 'lobby' | 'playing' | 'paused' | 'finished'
export type TurnStatus = 'waiting' | 'player_turn' | 'dm_turn' | 'resolving'
export type MessageType = 'player_action' | 'dm_response' | 'system' | 'combat' | 'narrative'
export type QueueStatus = 'pending' | 'processing' | 'completed' | 'failed'

/**
 * D&D выравнивания
 */
export type Alignment = 
    | 'lawful_good' | 'neutral_good' | 'chaotic_good'
    | 'lawful_neutral' | 'true_neutral' | 'chaotic_neutral'  
    | 'lawful_evil' | 'neutral_evil' | 'chaotic_evil'

/**
 * Уровень знания о существе в бестиарии (1-5)
 */
export type KnowledgeLevel = 1 | 2 | 3 | 4 | 5

/**
 * Категории бестиария
 */
export type BestiaryCategory = 
    | 'humanoid' | 'beast' | 'monstrosity' | 'undead' 
    | 'fiend' | 'celestial' | 'fey' | 'elemental' 
    | 'aberration' | 'construct' | 'dragon' | 'giant'
    | 'plant' | 'ooze' | 'other'

/**
 * Характер существа
 */
export type CreatureNature = 'hostile' | 'neutral' | 'friendly' | 'unknown'

// ─── JSONB структуры ──────────────────────────────────────────────────────────

/**
 * Настройки мира (world_settings JSONB)
 */
export interface WorldSettings {
    genre: 'fantasy' | 'sci-fi' | 'horror' | 'modern' | 'steampunk' | 'cyberpunk'
    difficulty: 'easy' | 'normal' | 'hard' | 'nightmare'
    tone: 'serious' | 'humorous' | 'dark' | 'light'
    combat_rules: 'simple' | 'standard' | 'advanced'
    homebrew_rules: string[]
    starting_location: string
    campaign_name: string
    max_players: number
    turn_time_limit?: number // секунды
    allow_pvp: boolean
    auto_roll_dice: boolean
    [key: string]: unknown // расширяемость
}

/**
 * Активный квест
 */
export interface Quest {
    id: string
    title: string
    description: string
    status: 'active' | 'completed' | 'failed' | 'paused'
    objectives: QuestObjective[]
    rewards?: string
    deadline?: string // ISO date
    priority: 'low' | 'normal' | 'high' | 'urgent'
    created_at: string // ISO date
}

export interface QuestObjective {
    id: string
    text: string
    completed: boolean
    optional: boolean
}

/**
 * Инвентарь персонажа (inventory JSONB)
 */
export interface CharacterInventory {
    items: InventoryItem[]
    currency: {
        gold: number
        silver: number
        copper: number
    }
    carrying_capacity: number
    current_weight: number
}

export interface InventoryItem {
    id: string
    name: string
    description?: string
    quantity: number
    weight: number
    value?: number // в copper
    type: 'weapon' | 'armor' | 'consumable' | 'tool' | 'treasure' | 'other'
    rarity?: 'common' | 'uncommon' | 'rare' | 'very_rare' | 'legendary' | 'artifact'
    equipped?: boolean
    properties?: string[]
}

/**
 * Навыки персонажа (skills JSONB)
 */
export interface CharacterSkills {
    [skillName: string]: {
        level: number
        experience: number
        modifier: number
        proficient: boolean
    }
}

/**
 * Активные статусы персонажа (statuses JSONB)
 */
export interface CharacterStatuses {
    [statusName: string]: {
        type: 'buff' | 'debuff' | 'neutral'
        description: string
        duration?: number // -1 = permanent
        stacks?: number
        source?: string // откуда получен
    }
}

/**
 * Травмы персонажа (injuries JSONB)
 */
export interface CharacterInjuries {
    [injuryName: string]: {
        severity: 'minor' | 'moderate' | 'severe' | 'critical'
        description: string
        effect: string
        healing_time?: number // days
        treated: boolean
    }
}

/**
 * Мутации персонажа (mutations JSONB)
 */
export interface CharacterMutations {
    [mutationName: string]: {
        type: 'beneficial' | 'detrimental' | 'neutral'
        description: string
        effect: string
        visible: boolean
        permanent: boolean
    }
}

/**
 * Репутация с фракциями (reputation JSONB)
 */
export interface CharacterReputation {
    [factionName: string]: {
        value: number // -100 to 100
        standing: 'hated' | 'disliked' | 'neutral' | 'liked' | 'revered'
        notes?: string
    }
}

/**
 * Метаданные сообщения (metadata JSONB)
 */
export interface MessageMetadata {
    // Для player_action
    action_type?: 'attack' | 'defend' | 'speak' | 'investigate' | 'move' | 'use_item' | 'cast_spell'
    target?: string
    
    // Для dm_response
    dice_rolls?: DiceRoll[]
    
    // Для combat
    damage_dealt?: number
    damage_received?: number
    damage_type?: string
    
    // Для системных сообщений
    system_type?: 'join' | 'leave' | 'turn_start' | 'turn_end' | 'level_up'
    
    // Общие
    tags?: string[]
    important?: boolean
    edited?: boolean
    edit_count?: number
    edited_at?: string // ISO date
    
    // Расширяемость
    [key: string]: unknown
}

export interface DiceRoll {
    notation: string // "1d20", "2d6+3", etc
    dice: Array<{
        sides: number
        count: number
        modifier: number
        results: number[]
    }>
    total: number
    critical_hit?: boolean
    critical_fail?: boolean
    advantage?: boolean
    disadvantage?: boolean
}

/**
 * Кандидат в очередь архивиста (candidate JSONB)
 */
export interface ArchivistCandidate {
    entity_name: string
    entity_type: 'creature' | 'location' | 'item' | 'lore' | 'npc'
    description: string
    context: string
    suggested_category?: BestiaryCategory
    suggested_knowledge_level?: KnowledgeLevel
    source_message_id: string
    extracted_at: string // ISO date
}

// ─── Database Row Types ───────────────────────────────────────────────────────

/**
 * Таблица users
 */
export interface UserRow {
    id: string // uuid
    google_id: string
    email: string
    display_name: string | null // может быть null если пользователь не дал разрешение
    avatar_url: string | null
    last_seen_at: Date
    created_at: Date
    updated_at: Date
}

/**
 * Публичная информация о пользователе (без sensitive данных)
 */
export interface PublicUserProfile {
    id: string
    display_name: string | null
    avatar_url: string | null
}

/**
 * Таблица sessions (устаревшая - используем JWT)
 */
export interface SessionRow {
    id: string
    user_id: string
    token: string
    expires_at: Date
    created_at: Date
}

/**
 * Таблица rooms
 */
export interface RoomRow {
    id: string
    host_user_id: string
    join_code: string
    status: RoomStatus
    turn_number: number
    turn_status: TurnStatus
    turn_started_at: Date | null
    story_summary: string
    world_settings: WorldSettings
    active_quests: Quest[]
    created_at: Date
    updated_at: Date
}

/**
 * Комната с информацией о хосте
 */
export interface RoomWithHost extends RoomRow {
    host_google_id: string
    host_email: string | null
}

/**
 * Таблица players (игроки в комнатах)
 */
export interface RoomPlayerRow {
    id: string
    room_id: string
    user_id: string
    
    // Базовая информация о персонаже
    character_name: string
    character_profile: string // описание внешности, история
    
    // Основные характеристики
    hp: number
    hp_max: number
    mana: number
    mana_max: number
    stress: number
    stress_max: number
    
    // Базовые статы D&D
    stat_strength: number
    stat_dexterity: number
    stat_constitution: number
    stat_intelligence: number
    stat_wisdom: number
    stat_charisma: number
    
    // Комплексные данные (JSONB)
    inventory: CharacterInventory
    skills: CharacterSkills
    statuses: CharacterStatuses
    injuries: CharacterInjuries
    mutations: CharacterMutations
    reputation: CharacterReputation
    
    // Игровое состояние
    alignment: Alignment | null
    current_action: string | null // что делает игрок прямо сейчас
    is_ready: boolean             // готов к началу хода/игры
    is_online: boolean            // подключен к SSE
    last_active_at: Date | null   // когда последний раз был активен
    
    created_at: Date
    updated_at: Date
}

/**
 * Публичная информация об игроке (для отображения другим)
 */
export interface PublicPlayerInfo {
    id: string
    user_id: string
    character_name: string
    hp: number
    hp_max: number
    is_ready: boolean
    is_online: boolean
    current_action: string | null
    // Приватные данные (точные статы, инвентарь) не включены
}

/**
 * Таблица messages
 */
export interface MessageRow {
    id: string
    room_id: string
    user_id: string | null    // null = системное сообщение или AI
    type: MessageType
    content: string
    metadata: MessageMetadata
    turn_number: number
    created_at: Date
}

/**
 * Таблица bestiary
 */
export interface BestiaryRow {
    id: string
    slug: string                       // URL-friendly идентификатор
    title: string
    category: BestiaryCategory
    content: string
    tags: string[]                     // PostgreSQL TEXT[] или JSONB array
    nature: CreatureNature
    knowledge_level: KnowledgeLevel
    author_notes: string | null
    source_room_id: string | null      // из какой игры была открыта
    discovered_by_user_id: string | null // кто открыл (null = системное)
    created_at: Date
    updated_at: Date
}

/**
 * Таблица archivist_queue
 */
export interface ArchivistQueueRow {
    id: string
    room_id: string
    candidate: ArchivistCandidate      // данные для создания записи бестиария
    status: QueueStatus
    attempts: number                   // количество попыток обработки
    last_error: string | null          // последняя ошибка
    bestiary_id: string | null         // ID созданной записи (если completed)
    created_at: Date
    updated_at: Date
}

// ─── API Request/Response Types ───────────────────────────────────────────────

/**
 * Ответ авторизации
 */
export interface LoginResponse {
    user: UserRow
    token: string
    expiresAt: string // ISO date
}

/**
 * Создание комнаты
 */
export interface CreateRoomRequest {
    world_settings?: Partial<WorldSettings>
}

export interface CreateRoomResponse {
    room: RoomRow
    join_code: string
}

/**
 * Присоединение к комнате
 */
export interface JoinRoomRequest {
    join_code: string
    character_name: string
    character_profile?: string
}

export interface JoinRoomResponse {
    room: RoomRow
    player: RoomPlayerRow
    existing_players: RoomPlayerRow[]
}

/**
 * Обновление игрока
 */
export interface UpdatePlayerRequest {
    character_profile?: string
    is_ready?: boolean
    current_action?: string | null
}

/**
 * Действие игрока
 */
export interface PlayerActionRequest {
    action: string                    // что хочет сделать игрок
    action_type?: string             // тип действия для метаданных
    target?: string                  // цель действия
}

export interface PlayerActionResponse {
    message_id: string
    success: boolean
}

/**
 * Получение сообщений
 */
export interface GetMessagesRequest {
    page?: number
    page_size?: number
    since_turn?: number
}

export interface GetMessagesResponse {
    messages: MessageRow[]
    total: number
    page: number
    page_size: number
    has_more: boolean
}

/**
 * Отправка сообщения
 */
export interface SendMessageRequest {
    content: string
    type?: MessageType
}

export interface SendMessageResponse {
    message: MessageRow
}

/**
 * Поиск в бестиарии
 */
export interface SearchBestiaryRequest {
    query?: string
    category?: BestiaryCategory
    knowledge_level?: KnowledgeLevel
    page?: number
    page_size?: number
}

export interface SearchBestiaryResponse {
    entries: BestiaryRow[]
    total: number
    page: number
    page_size: number
    categories: Array<{ name: string; count: number }>
}

/**
 * Создание записи бестиария
 */
export interface CreateBestiaryRequest {
    title: string
    category: BestiaryCategory
    content: string
    tags?: string[]
    nature?: CreatureNature
    knowledge_level: KnowledgeLevel
    author_notes?: string
}

/**
 * Ошибка API
 */
export interface ErrorResponse {
    error: string
    code?: string
    details?: Record<string, unknown>
}

/**
 * Health check
 */
export interface HealthCheckResponse {
    status: 'ok' | 'degraded' | 'down'
    timestamp: string
    version: string
    database: {
        healthy: boolean
        latency: number
        pool: {
            total: number
            idle: number
            waiting: number
        }
    }
    uptime: number
}

/**
 * Стандартный ответ API
 */
export interface ApiResponse<T = unknown> {
    success: boolean
    data?: T
    error?: string
    code?: string
    timestamp: string
}

/**
 * Пагинированный ответ
 */
export interface PaginatedApiResponse<T> extends ApiResponse<T[]> {
    pagination: {
        page: number
        pageSize: number
        total: number
        hasMore: boolean
    }
}

// ─── SSE Event Types ──────────────────────────────────────────────────────────

/**
 * Карта всех возможных SSE событий
 */
export interface SSEEventMap {
    // Снапшот при подключении
    'room.snapshot': {
        room: RoomRow
        players: PublicPlayerInfo[]
        messages: MessageRow[]
        isGenerating: boolean
    }

    // Статус комнаты
    'room.updated': {
        status?: RoomStatus
        turn_number?: number
        turn_status?: TurnStatus
        story_summary?: string
        isGenerating?: boolean
        active_quests?: Quest[]
    }

    // Игроки
    'player.joined': {
        player: PublicPlayerInfo
    }
    
    'player.updated': {
        player_id: string
        changes: Partial<PublicPlayerInfo>
    }
    
    'player.left': {
        player_id: string
        reason?: 'disconnect' | 'kicked' | 'left'
    }

    // Сообщения
    'message.new': MessageRow

    // AI стриминг
    'ai.stream.start': { 
        message_id: string 
        estimated_duration?: number
    }
    
    'ai.stream.chunk': { 
        message_id: string
        token: string
        full_content: string
    }
    
    'ai.stream.end': { 
        message_id: string
        saved_message: MessageRow
    }
    
    'ai.stream.error': { 
        message_id: string
        error: string
    }

    // Системные события
    'system.notification': {
        type: 'info' | 'warning' | 'error' | 'success'
        message: string
        dismissible?: boolean
        duration?: number // ms
    }

    'connection.error': { 
        code: string
        message: string
        recoverable: boolean
    }

    // Игровые события
    'turn.started': {
        turn_number: number
        active_player_id?: string
        time_limit?: number // seconds
    }

    'dice.rolled': {
        player_id: string
        dice: Array<{
            notation: string
            result: number
            breakdown: number[]
        }>
    }

    'quest.updated': {
        quest: Quest
        type: 'added' | 'completed' | 'failed' | 'updated'
    }
}

export type SSEEventName = keyof SSEEventMap
export type SSEEventData<T extends SSEEventName> = SSEEventMap[T]

/**
 * Обёртка для SSE события
 */
export interface SSEEvent<T extends SSEEventName = SSEEventName> {
    id?: string
    event: T
    data: SSEEventData<T>
    retry?: number
}

// ─── Utility Types ────────────────────────────────────────────────────────────

/**
 * Тип для создания записей (без автогенерируемых полей)
 */
export type CreateRecord<T> = Omit<T, 'id' | 'created_at' | 'updated_at'>

/**
 * Тип для обновления записей (все поля опциональны кроме системных)
 */
export type UpdateRecord<T> = Partial<Omit<T, 'id' | 'created_at' | 'updated_at'>>

/**
 * Результат пагинации
 */
export interface PaginationResult<T> {
    items: T[]
    total: number
    page: number
    pageSize: number
    hasMore: boolean
}

/**
 * Базовый результат операции
 */
export interface OperationResult<T = unknown> {
    success: boolean
    data?: T
    error?: string
    code?: string
}

// ─── Express Request Extension ────────────────────────────────────────────────

declare global {
    namespace Express {
        interface Request {
            user: UserRow  // обязательный после auth middleware
        }
    }
}