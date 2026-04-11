// server/database/repositories/players.repository.ts

import { pool } from '../pool'
import { PoolClient } from 'pg'

// ─── Типы ─────────────────────────────────────────────────────────────────────

/**
 * D&D статы персонажа
 */
export interface CharacterStats {
    strength: number      // Сила
    dexterity: number     // Ловкость
    constitution: number  // Телосложение
    intelligence: number  // Интеллект
    wisdom: number        // Мудрость
    charisma: number      // Харизма
}

/**
 * Предмет в инвентаре
 */
export interface InventoryItem {
    id: string
    name: string
    description?: string
    quantity: number
    weight?: number
    magical?: boolean
}

/**
 * Навык персонажа
 */
export interface Skill {
    name: string
    level: number         // 1-5
    description?: string
}

/**
 * Активный статус (баф/дебаф)
 */
export interface ActiveStatus {
    name: string
    description: string
    duration: number      // в ходах, -1 = бесконечно
    type: 'buff' | 'debuff' | 'neutral'
}

/**
 * Травма
 */
export interface Injury {
    name: string
    severity: 'minor' | 'moderate' | 'severe' | 'critical'
    description: string
    healing_time?: number // в ходах
}

/**
 * Мутация (для Warhammer/Lovecraft сеттингов)
 */
export interface Mutation {
    name: string
    description: string
    effects: string
    corrupted?: boolean
}

/**
 * Репутация с фракциями
 */
export interface Reputation {
    [factionName: string]: number  // -100 до 100
}

/**
 * Строка таблицы room_players
 */
export interface RoomPlayerRow {
    id: string
    room_id: string
    user_id: string
    
    // Профиль персонажа
    character_name: string
    character_profile: string
    
    // Ресурсы
    hp: number
    hp_max: number
    mana: number
    mana_max: number
    stress: number
    stress_max: number
    
    // Статы
    stat_strength: number
    stat_dexterity: number
    stat_constitution: number
    stat_intelligence: number
    stat_wisdom: number
    stat_charisma: number
    
    // Инвентарь и состояние
    inventory: InventoryItem[]
    skills: Skill[]
    statuses: ActiveStatus[]
    injuries: Injury[]
    mutations: Mutation[]
    
    // Мета
    alignment: string | null         // 'lawful good', 'chaotic evil', etc
    reputation: Reputation
    
    // Игровое состояние
    current_action: string | null
    is_ready: boolean
    is_online: boolean
    last_active_at: Date
    
    created_at: Date
    updated_at: Date
}

/**
 * Расширенная версия с данными пользователя из JOIN
 */
export interface RoomPlayerWithUser extends RoomPlayerRow {
    external_user_id: string  // google_id из таблицы users
}

/**
 * Данные для создания игрока
 */
export interface CreatePlayerData {
    room_id: string
    user_id: string
    character_name: string
    character_profile: string
    
    // Начальные значения (можно задать или использовать дефолты)
    hp?: number
    hp_max?: number
    mana?: number
    mana_max?: number
    stress?: number
    stress_max?: number
    
    // Статы (дефолт = 10)
    stat_strength?: number
    stat_dexterity?: number
    stat_constitution?: number
    stat_intelligence?: number
    stat_wisdom?: number
    stat_charisma?: number
    
    alignment?: string | null
    inventory?: InventoryItem[]
    skills?: Skill[]
}

/**
 * Обновление состояния игрока
 */
export interface UpdatePlayerData {
    // Ресурсы
    hp?: number
    mana?: number
    stress?: number
    
    // Инвентарь и состояние
    inventory?: InventoryItem[]
    skills?: Skill[]
    statuses?: ActiveStatus[]
    injuries?: Injury[]
    mutations?: Mutation[]
    reputation?: Reputation
    
    // Действие
    current_action?: string | null
    is_ready?: boolean
    is_online?: boolean
}

// ─── Репозиторий ──────────────────────────────────────────────────────────────

export class PlayersRepository {
    /**
     * Создание игрока в комнате
     */
    async create(data: CreatePlayerData): Promise<RoomPlayerWithUser> {
        this.validateCreateData(data)

        // Дефолтные значения для ресурсов
        const defaults = {
            hp: data.hp ?? 100,
            hp_max: data.hp_max ?? 100,
            mana: data.mana ?? 50,
            mana_max: data.mana_max ?? 50,
            stress: data.stress ?? 0,
            stress_max: data.stress_max ?? 100,
            stat_strength: data.stat_strength ?? 10,
            stat_dexterity: data.stat_dexterity ?? 10,
            stat_constitution: data.stat_constitution ?? 10,
            stat_intelligence: data.stat_intelligence ?? 10,
            stat_wisdom: data.stat_wisdom ?? 10,
            stat_charisma: data.stat_charisma ?? 10,
        }

        const sql = `
            INSERT INTO room_players (
                room_id,
                user_id,
                character_name,
                character_profile,
                hp,
                hp_max,
                mana,
                mana_max,
                stress,
                stress_max,
                stat_strength,
                stat_dexterity,
                stat_constitution,
                stat_intelligence,
                stat_wisdom,
                stat_charisma,
                inventory,
                skills,
                statuses,
                injuries,
                alignment,
                mutations,
                reputation,
                current_action,
                is_ready,
                is_online,
                last_active_at,
                created_at,
                updated_at
            )
            VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
                $11, $12, $13, $14, $15, $16,
                $17, $18, $19, $20, $21, $22, $23,
                $24, $25, $26, NOW(), NOW(), NOW()
            )
            RETURNING *
        `

        const params = [
            data.room_id,
            data.user_id,
            data.character_name,
            data.character_profile,
            defaults.hp,
            defaults.hp_max,
            defaults.mana,
            defaults.mana_max,
            defaults.stress,
            defaults.stress_max,
            defaults.stat_strength,
            defaults.stat_dexterity,
            defaults.stat_constitution,
            defaults.stat_intelligence,
            defaults.stat_wisdom,
            defaults.stat_charisma,
            data.inventory || [],              // JSONB — не нужен stringify
            data.skills || [],
            [],                                 // statuses — пусто при создании
            [],                                 // injuries
            data.alignment || null,
            [],                                 // mutations
            {},                                 // reputation
            null,                               // current_action
            false,                              // is_ready
            true,                               // is_online (только что зашёл)
        ]

        try {
            const result = await pool.query<RoomPlayerRow>(sql, params)
            const player = result.rows[0]

            // Получаем с external_user_id
            return this.findByRoomAndUser(player.room_id, player.user_id) as Promise<RoomPlayerWithUser>
            
        } catch (error) {
            const pgError = error as { code?: string; constraint?: string }

            // 23505 = unique violation (игрок уже в комнате)
            if (pgError.code === '23505') {
                throw new Error('Игрок уже находится в этой комнате')
            }

            // 23503 = foreign key violation
            if (pgError.code === '23503') {
                if (pgError.constraint?.includes('room')) {
                    throw new Error(`Комната ${data.room_id} не найдена`)
                }
                if (pgError.constraint?.includes('user')) {
                    throw new Error(`Пользователь ${data.user_id} не найден`)
                }
            }

            console.error('[PlayersRepository] Ошибка create:', error)
            throw new Error('Не удалось создать игрока')
        }
    }

    /**
     * Создание с использованием транзакции
     */
    async createWithClient(
        client: PoolClient,
        data: CreatePlayerData
    ): Promise<RoomPlayerRow> {
        this.validateCreateData(data)

        const defaults = {
            hp: data.hp ?? 100,
            hp_max: data.hp_max ?? 100,
            mana: data.mana ?? 50,
            mana_max: data.mana_max ?? 50,
            stress: data.stress ?? 0,
            stress_max: data.stress_max ?? 100,
            stat_strength: data.stat_strength ?? 10,
            stat_dexterity: data.stat_dexterity ?? 10,
            stat_constitution: data.stat_constitution ?? 10,
            stat_intelligence: data.stat_intelligence ?? 10,
            stat_wisdom: data.stat_wisdom ?? 10,
            stat_charisma: data.stat_charisma ?? 10,
        }

        const sql = `
            INSERT INTO room_players (
                room_id, user_id, character_name, character_profile,
                hp, hp_max, mana, mana_max, stress, stress_max,
                stat_strength, stat_dexterity, stat_constitution,
                stat_intelligence, stat_wisdom, stat_charisma,
                inventory, skills, statuses, injuries, alignment,
                mutations, reputation, current_action, is_ready,
                is_online, last_active_at, created_at, updated_at
            )
            VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
                $11, $12, $13, $14, $15, $16, $17, $18, $19,
                $20, $21, $22, $23, $24, $25, $26, NOW(), NOW(), NOW()
            )
            RETURNING *
        `

        const params = [
            data.room_id, data.user_id, data.character_name, data.character_profile,
            defaults.hp, defaults.hp_max, defaults.mana, defaults.mana_max,
            defaults.stress, defaults.stress_max, defaults.stat_strength,
            defaults.stat_dexterity, defaults.stat_constitution,
            defaults.stat_intelligence, defaults.stat_wisdom, defaults.stat_charisma,
            data.inventory || [], data.skills || [], [], [], data.alignment || null,
            [], {}, null, false, true,
        ]

        const result = await client.query<RoomPlayerRow>(sql, params)
        return result.rows[0]
    }

    /**
     * Поиск игрока по ID
     */
    async findById(playerId: string): Promise<RoomPlayerWithUser | null> {
        const sql = `
            SELECT 
                p.*,
                u.google_id as external_user_id
            FROM room_players p
            JOIN users u ON p.user_id = u.id
            WHERE p.id = $1
        `

        try {
            const result = await pool.query<RoomPlayerWithUser>(sql, [playerId])
            return result.rows[0] ?? null
        } catch (error) {
            console.error('[PlayersRepository] Ошибка findById:', error)
            throw new Error('Не удалось найти игрока')
        }
    }

    /**
     * Получить всех игроков комнаты
     */
    async findByRoom(roomId: string): Promise<RoomPlayerWithUser[]> {
        const sql = `
            SELECT 
                p.*,
                u.google_id as external_user_id
            FROM room_players p
            JOIN users u ON p.user_id = u.id
            WHERE p.room_id = $1
            ORDER BY p.created_at ASC
        `

        try {
            const result = await pool.query<RoomPlayerWithUser>(sql, [roomId])
            return result.rows
        } catch (error) {
            console.error('[PlayersRepository] Ошибка findByRoom:', error)
            throw new Error('Не удалось получить игроков комнаты')
        }
    }

    /**
     * Получить игрока по комнате и пользователю
     */
    async findByRoomAndUser(
        roomId: string,
        userId: string
    ): Promise<RoomPlayerWithUser | null> {
        const sql = `
            SELECT 
                p.*,
                u.google_id as external_user_id
            FROM room_players p
            JOIN users u ON p.user_id = u.id
            WHERE p.room_id = $1 AND p.user_id = $2
        `

        try {
            const result = await pool.query<RoomPlayerWithUser>(sql, [roomId, userId])
            return result.rows[0] ?? null
        } catch (error) {
            console.error('[PlayersRepository] Ошибка findByRoomAndUser:', error)
            throw new Error('Не удалось найти игрока')
        }
    }

    /**
     * Проверка что пользователь является игроком в комнате
     */
    async isPlayerInRoom(userId: string, roomId: string): Promise<boolean> {
        const sql = `
            SELECT EXISTS(
                SELECT 1 FROM room_players 
                WHERE user_id = $1 AND room_id = $2
            ) as exists
        `

        try {
            const result = await pool.query<{ exists: boolean }>(sql, [userId, roomId])
            return result.rows[0].exists
        } catch (error) {
            console.error('[PlayersRepository] Ошибка isPlayerInRoom:', error)
            return false
        }
    }

    /**
     * Обновление действия игрока
     */
    async updateAction(
        playerId: string,
        action: string | null,
        isReady: boolean
    ): Promise<RoomPlayerWithUser | null> {
        const sql = `
            UPDATE room_players
            SET 
                current_action = $1,
                is_ready = $2,
                last_active_at = NOW(),
                updated_at = NOW()
            WHERE id = $3
            RETURNING *
        `

        try {
            const result = await pool.query<RoomPlayerRow>(sql, [action, isReady, playerId])
            
            if (result.rows.length === 0) {
                return null
            }

            const player = result.rows[0]
            return this.findByRoomAndUser(player.room_id, player.user_id)
        } catch (error) {
            console.error('[PlayersRepository] Ошибка updateAction:', error)
            throw new Error('Не удалось обновить действие игрока')
        }
    }

    /**
     * Универсальное обновление состояния игрока
     * Динамически строит SET только для переданных полей
     */
    async updateState(
        playerId: string,
        updates: UpdatePlayerData
    ): Promise<RoomPlayerWithUser | null> {
        const setClauses: string[] = []
        const params: any[] = []

        // Числовые поля
        if (updates.hp !== undefined) {
            params.push(updates.hp)
            setClauses.push(`hp = $${params.length}`)
        }

        if (updates.mana !== undefined) {
            params.push(updates.mana)
            setClauses.push(`mana = $${params.length}`)
        }

        if (updates.stress !== undefined) {
            params.push(updates.stress)
            setClauses.push(`stress = $${params.length}`)
        }

        // JSONB поля
        if (updates.inventory !== undefined) {
            params.push(updates.inventory)
            setClauses.push(`inventory = $${params.length}`)
        }

        if (updates.skills !== undefined) {
            params.push(updates.skills)
            setClauses.push(`skills = $${params.length}`)
        }

        if (updates.statuses !== undefined) {
            params.push(updates.statuses)
            setClauses.push(`statuses = $${params.length}`)
        }

        if (updates.injuries !== undefined) {
            params.push(updates.injuries)
            setClauses.push(`injuries = $${params.length}`)
        }

        if (updates.mutations !== undefined) {
            params.push(updates.mutations)
            setClauses.push(`mutations = $${params.length}`)
        }

        if (updates.reputation !== undefined) {
            params.push(updates.reputation)
            setClauses.push(`reputation = $${params.length}`)
        }

        // Прочие поля
        if (updates.current_action !== undefined) {
            params.push(updates.current_action)
            setClauses.push(`current_action = $${params.length}`)
        }

        if (updates.is_ready !== undefined) {
            params.push(updates.is_ready)
            setClauses.push(`is_ready = $${params.length}`)
        }

        if (updates.is_online !== undefined) {
            params.push(updates.is_online)
            setClauses.push(`is_online = $${params.length}`)
        }

        // Если нечего обновлять — возвращаем текущего игрока
        if (setClauses.length === 0) {
            return this.findById(playerId)
        }

        // Всегда обновляем last_active_at и updated_at
        setClauses.push('last_active_at = NOW()')
        setClauses.push('updated_at = NOW()')

        params.push(playerId)

        const sql = `
            UPDATE room_players
            SET ${setClauses.join(', ')}
            WHERE id = $${params.length}
            RETURNING *
        `

        try {
            const result = await pool.query<RoomPlayerRow>(sql, params)
            
            if (result.rows.length === 0) {
                return null
            }

            const player = result.rows[0]
            return this.findByRoomAndUser(player.room_id, player.user_id)
        } catch (error) {
            console.error('[PlayersRepository] Ошибка updateState:', error)
            throw new Error('Не удалось обновить состояние игрока')
        }
    }

    /**
     * Обновление онлайн статуса
     */
    async updateOnlineStatus(
        playerId: string,
        isOnline: boolean
    ): Promise<void> {
        const sql = `
            UPDATE room_players
            SET 
                is_online = $1,
                last_active_at = NOW(),
                updated_at = NOW()
            WHERE id = $2
        `

        try {
            await pool.query(sql, [isOnline, playerId])
        } catch (error) {
            console.error('[PlayersRepository] Ошибка updateOnlineStatus:', error)
            // Не бросаем ошибку — это некритично
        }
    }

    /**
     * Сброс готовности всех игроков комнаты (после начала хода)
     */
    async resetReadyStatus(roomId: string): Promise<void> {
        const sql = `
            UPDATE room_players
            SET 
                is_ready = false,
                current_action = NULL,
                updated_at = NOW()
            WHERE room_id = $1
        `

        try {
            await pool.query(sql, [roomId])
        } catch (error) {
            console.error('[PlayersRepository] Ошибка resetReadyStatus:', error)
            throw new Error('Не удалось сбросить статус готовности')
        }
    }

    /**
     * Удаление игрока из комнаты
     */
    async delete(playerId: string): Promise<boolean> {
        const sql = 'DELETE FROM room_players WHERE id = $1 RETURNING id'

        try {
            const result = await pool.query(sql, [playerId])
            return result.rowCount !== null && result.rowCount > 0
        } catch (error) {
            console.error('[PlayersRepository] Ошибка delete:', error)
            throw new Error('Не удалось удалить игрока')
        }
    }

    /**
     * Удаление всех игроков комнаты (при удалении комнаты)
     */
    async deleteByRoom(roomId: string): Promise<number> {
        const sql = 'DELETE FROM room_players WHERE room_id = $1'

        try {
            const result = await pool.query(sql, [roomId])
            return result.rowCount ?? 0
        } catch (error) {
            console.error('[PlayersRepository] Ошибка deleteByRoom:', error)
            throw new Error('Не удалось удалить игроков комнаты')
        }
    }

    /**
     * Получить количество игроков в комнате
     */
    async countByRoom(roomId: string): Promise<number> {
        const sql = 'SELECT COUNT(*) as count FROM room_players WHERE room_id = $1'

        try {
            const result = await pool.query<{ count: string }>(sql, [roomId])
            return parseInt(result.rows[0].count, 10)
        } catch (error) {
            console.error('[PlayersRepository] Ошибка countByRoom:', error)
            return 0
        }
    }

    /**
     * Получить готовых игроков комнаты
     */
    async getReadyPlayers(roomId: string): Promise<RoomPlayerWithUser[]> {
        const sql = `
            SELECT 
                p.*,
                u.google_id as external_user_id
            FROM room_players p
            JOIN users u ON p.user_id = u.id
            WHERE p.room_id = $1 AND p.is_ready = true
            ORDER BY p.updated_at ASC
        `

        try {
            const result = await pool.query<RoomPlayerWithUser>(sql, [roomId])
            return result.rows
        } catch (error) {
            console.error('[PlayersRepository] Ошибка getReadyPlayers:', error)
            throw new Error('Не удалось получить готовых игроков')
        }
    }

    /**
     * Валидация данных для создания
     */
    private validateCreateData(data: CreatePlayerData): void {
        const errors: string[] = []

        if (!data.room_id || typeof data.room_id !== 'string') {
            errors.push('room_id обязателен')
        }

        if (!data.user_id || typeof data.user_id !== 'string') {
            errors.push('user_id обязателен')
        }

        if (!data.character_name || typeof data.character_name !== 'string') {
            errors.push('character_name обязателен')
        }

        if (data.character_name && data.character_name.length > 100) {
            errors.push('character_name не может быть длиннее 100 символов')
        }

        if (!data.character_profile || typeof data.character_profile !== 'string') {
            errors.push('character_profile обязателен')
        }

        if (data.character_profile && data.character_profile.length > 2000) {
            errors.push('character_profile не может быть длиннее 2000 символов')
        }

        // Валидация числовых значений если переданы
        const numericFields = [
            'hp', 'hp_max', 'mana', 'mana_max', 'stress', 'stress_max',
            'stat_strength', 'stat_dexterity', 'stat_constitution',
            'stat_intelligence', 'stat_wisdom', 'stat_charisma'
        ] as const

        numericFields.forEach(field => {
            const value = data[field]
            if (value !== undefined && (typeof value !== 'number' || value < 0)) {
                errors.push(`${field} должен быть неотрицательным числом`)
            }
        })

        if (errors.length > 0) {
            throw new Error(`Ошибка валидации: ${errors.join(', ')}`)
        }
    }
}

// Экспортируем синглтон
export const playersRepository = new PlayersRepository()