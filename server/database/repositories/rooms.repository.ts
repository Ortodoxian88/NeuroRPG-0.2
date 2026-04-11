// server/database/repositories/rooms.repository.ts

import { pool } from '../pool'
import { PoolClient } from 'pg'
import crypto from 'crypto'

// ─── Типы ─────────────────────────────────────────────────────────────────────

/**
 * Статус комнаты
 */
export type RoomStatus = 'lobby' | 'playing' | 'paused' | 'finished'

/**
 * Статус хода
 */
export type TurnStatus = 'waiting' | 'player_turn' | 'dm_turn' | 'resolving'

/**
 * Настройки мира (хранятся как JSONB)
 */
export interface WorldSettings {
    genre?: string              // 'fantasy', 'sci-fi', 'horror', etc
    difficulty?: 'easy' | 'normal' | 'hard'
    tone?: 'serious' | 'humorous' | 'dark'
    combat_rules?: 'simple' | 'advanced'
    homebrew_rules?: string[]
    starting_location?: string
    campaign_name?: string
    [key: string]: unknown      // расширяемость
}

/**
 * Активный квест
 */
export interface Quest {
    id: string
    title: string
    description: string
    status: 'active' | 'completed' | 'failed'
    objectives: string[]
    rewards?: string
}

/**
 * Строка таблицы rooms из БД
 */
export interface RoomRow {
    id: string
    host_user_id: string
    join_code: string
    status: RoomStatus
    turn_number: number
    turn_status: TurnStatus
    story_summary: string
    world_settings: WorldSettings
    active_quests: Quest[]
    created_at: Date
    updated_at: Date
}

/**
 * Расширенная информация о комнате с данными хоста
 */
export interface RoomWithHost extends RoomRow {
    host_google_id: string      // Google ID хоста для отображения
    host_email: string | null
}

/**
 * Данные для создания комнаты
 */
export interface CreateRoomData {
    host_user_id: string
    world_settings?: WorldSettings
}

/**
 * Данные для обновления комнаты
 */
export interface UpdateRoomData {
    status?: RoomStatus
    turn_number?: number
    turn_status?: TurnStatus
    story_summary?: string
    world_settings?: WorldSettings
    active_quests?: Quest[]
}

// ─── Утилиты ──────────────────────────────────────────────────────────────────

/**
 * Генерация уникального 6-символьного кода комнаты
 * Формат: ABCD12 (uppercase буквы и цифры)
 */
function generateJoinCode(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
    let code = ''
    
    // Используем crypto.randomInt для криптографически стойкой случайности
    for (let i = 0; i < 6; i++) {
        const randomIndex = crypto.randomInt(0, chars.length)
        code += chars[randomIndex]
    }
    
    return code
}

// ─── Репозиторий ──────────────────────────────────────────────────────────────

export class RoomsRepository {
    /**
     * Создание новой комнаты с уникальным join_code
     * Автоматически проверяет уникальность кода (retry при коллизии)
     */
    async createRoom(data: CreateRoomData): Promise<RoomRow> {
        this.validateCreateData(data)

        const MAX_RETRIES = 5
        let attempts = 0

        while (attempts < MAX_RETRIES) {
            const joinCode = generateJoinCode()

            const sql = `
                INSERT INTO rooms (
                    host_user_id,
                    join_code,
                    status,
                    turn_number,
                    turn_status,
                    story_summary,
                    world_settings,
                    active_quests,
                    created_at,
                    updated_at
                )
                VALUES ($1, $2, 'lobby', 0, 'waiting', '', $3, $4, NOW(), NOW())
                RETURNING *
            `

            const params = [
                data.host_user_id,
                joinCode,
                data.world_settings || {},
                [], // пустой массив квестов
            ]

            try {
                const result = await pool.query<RoomRow>(sql, params)
                return result.rows[0]
            } catch (error) {
                const pgError = error as { code?: string; constraint?: string }

                // 23505 = unique violation (join_code уже существует)
                if (pgError.code === '23505' && pgError.constraint?.includes('join_code')) {
                    attempts++
                    console.warn(
                        `[RoomsRepository] Коллизия join_code: ${joinCode}, ` +
                        `попытка ${attempts}/${MAX_RETRIES}`
                    )
                    continue // пробуем сгенерировать новый код
                }

                // 23503 = foreign key violation (host_user_id не существует)
                if (pgError.code === '23503') {
                    throw new Error(`Пользователь ${data.host_user_id} не найден`)
                }

                console.error('[RoomsRepository] Ошибка createRoom:', error)
                throw new Error('Не удалось создать комнату')
            }
        }

        // Если после 5 попыток не удалось — крайне маловероятно, но возможно
        throw new Error('Не удалось сгенерировать уникальный код комнаты')
    }

    /**
     * Поиск комнаты по ID
     */
    async findById(roomId: string): Promise<RoomRow | null> {
        const sql = 'SELECT * FROM rooms WHERE id = $1'

        try {
            const result = await pool.query<RoomRow>(sql, [roomId])
            return result.rows[0] ?? null
        } catch (error) {
            console.error('[RoomsRepository] Ошибка findById:', error)
            throw new Error('Не удалось найти комнату')
        }
    }

    /**
     * Поиск комнаты по ID с информацией о хосте
     */
    async findByIdWithHost(roomId: string): Promise<RoomWithHost | null> {
        const sql = `
            SELECT 
                r.*,
                u.google_id as host_google_id,
                u.email as host_email
            FROM rooms r
            JOIN users u ON r.host_user_id = u.id
            WHERE r.id = $1
        `

        try {
            const result = await pool.query<RoomWithHost>(sql, [roomId])
            return result.rows[0] ?? null
        } catch (error) {
            console.error('[RoomsRepository] Ошибка findByIdWithHost:', error)
            throw new Error('Не удалось найти комнату с данными хоста')
        }
    }

    /**
     * Поиск комнаты по join_code
     */
    async findByJoinCode(joinCode: string): Promise<RoomRow | null> {
        // Нормализуем код — uppercase, без пробелов
        const normalizedCode = joinCode.trim().toUpperCase()

        const sql = 'SELECT * FROM rooms WHERE join_code = $1'

        try {
            const result = await pool.query<RoomRow>(sql, [normalizedCode])
            return result.rows[0] ?? null
        } catch (error) {
            console.error('[RoomsRepository] Ошибка findByJoinCode:', error)
            throw new Error('Не удалось найти комнату по коду')
        }
    }

    /**
     * Поиск комнаты по join_code с информацией о хосте
     */
    async findByJoinCodeWithHost(joinCode: string): Promise<RoomWithHost | null> {
        const normalizedCode = joinCode.trim().toUpperCase()

        const sql = `
            SELECT 
                r.*,
                u.google_id as host_google_id,
                u.email as host_email
            FROM rooms r
            JOIN users u ON r.host_user_id = u.id
            WHERE r.join_code = $1
        `

        try {
            const result = await pool.query<RoomWithHost>(sql, [normalizedCode])
            return result.rows[0] ?? null
        } catch (error) {
            console.error('[RoomsRepository] Ошибка findByJoinCodeWithHost:', error)
            throw new Error('Не удалось найти комнату по коду с данными хоста')
        }
    }

    /**
     * Получить все комнаты пользователя (где он хост)
     */
    async findByHost(hostUserId: string): Promise<RoomRow[]> {
        const sql = `
            SELECT *
            FROM rooms
            WHERE host_user_id = $1
            ORDER BY created_at DESC
        `

        try {
            const result = await pool.query<RoomRow>(sql, [hostUserId])
            return result.rows
        } catch (error) {
            console.error('[RoomsRepository] Ошибка findByHost:', error)
            throw new Error('Не удалось получить комнаты пользователя')
        }
    }

    /**
     * Получить активные комнаты (lobby или playing)
     */
    async findActive(): Promise<RoomRow[]> {
        const sql = `
            SELECT *
            FROM rooms
            WHERE status IN ('lobby', 'playing')
            ORDER BY created_at DESC
            LIMIT 100
        `

        try {
            const result = await pool.query<RoomRow>(sql)
            return result.rows
        } catch (error) {
            console.error('[RoomsRepository] Ошибка findActive:', error)
            throw new Error('Не удалось получить активные комнаты')
        }
    }

    /**
     * Обновление комнаты
     */
    async update(roomId: string, data: UpdateRoomData): Promise<RoomRow | null> {
        const updates: string[] = []
        const params: unknown[] = []

        if (data.status !== undefined) {
            this.validateStatus(data.status)
            params.push(data.status)
            updates.push(`status = $${params.length}`)
        }

        if (data.turn_number !== undefined) {
            if (data.turn_number < 0) {
                throw new Error('turn_number не может быть отрицательным')
            }
            params.push(data.turn_number)
            updates.push(`turn_number = $${params.length}`)
        }

        if (data.turn_status !== undefined) {
            this.validateTurnStatus(data.turn_status)
            params.push(data.turn_status)
            updates.push(`turn_status = $${params.length}`)
        }

        if (data.story_summary !== undefined) {
            params.push(data.story_summary)
            updates.push(`story_summary = $${params.length}`)
        }

        if (data.world_settings !== undefined) {
            params.push(data.world_settings)
            updates.push(`world_settings = $${params.length}`)
        }

        if (data.active_quests !== undefined) {
            params.push(data.active_quests)
            updates.push(`active_quests = $${params.length}`)
        }

        if (updates.length === 0) {
            return this.findById(roomId)
        }

        updates.push('updated_at = NOW()')
        params.push(roomId)

        const sql = `
            UPDATE rooms
            SET ${updates.join(', ')}
            WHERE id = $${params.length}
            RETURNING *
        `

        try {
            const result = await pool.query<RoomRow>(sql, params)
            return result.rows[0] ?? null
        } catch (error) {
            console.error('[RoomsRepository] Ошибка update:', error)
            throw new Error('Не удалось обновить комнату')
        }
    }

    /**
     * Обновление только статуса комнаты (частый кейс)
     */
    async updateStatus(roomId: string, status: RoomStatus): Promise<RoomRow | null> {
        this.validateStatus(status)

        const sql = `
            UPDATE rooms
            SET status = $1, updated_at = NOW()
            WHERE id = $2
            RETURNING *
        `

        try {
            const result = await pool.query<RoomRow>(sql, [status, roomId])
            return result.rows[0] ?? null
        } catch (error) {
            console.error('[RoomsRepository] Ошибка updateStatus:', error)
            throw new Error('Не удалось обновить статус комнаты')
        }
    }

    /**
     * Обновление хода (частый кейс)
     */
    async updateTurn(
        roomId: string,
        turnNumber: number,
        turnStatus: TurnStatus,
        storySummary?: string
    ): Promise<RoomRow | null> {
        this.validateTurnStatus(turnStatus)

        if (turnNumber < 0) {
            throw new Error('turn_number не может быть отрицательным')
        }

        const sql = `
            UPDATE rooms
            SET 
                turn_number = $1,
                turn_status = $2,
                story_summary = COALESCE($3, story_summary),
                updated_at = NOW()
            WHERE id = $4
            RETURNING *
        `

        try {
            const result = await pool.query<RoomRow>(
                sql,
                [turnNumber, turnStatus, storySummary ?? null, roomId]
            )
            return result.rows[0] ?? null
        } catch (error) {
            console.error('[RoomsRepository] Ошибка updateTurn:', error)
            throw new Error('Не удалось обновить ход комнаты')
        }
    }

    /**
     * Добавить квест в активные
     */
    async addQuest(roomId: string, quest: Quest): Promise<RoomRow | null> {
        const sql = `
            UPDATE rooms
            SET 
                active_quests = active_quests || $1::jsonb,
                updated_at = NOW()
            WHERE id = $2
            RETURNING *
        `

        try {
            const result = await pool.query<RoomRow>(sql, [JSON.stringify(quest), roomId])
            return result.rows[0] ?? null
        } catch (error) {
            console.error('[RoomsRepository] Ошибка addQuest:', error)
            throw new Error('Не удалось добавить квест')
        }
    }

    /**
     * Обновить статус квеста
     */
    async updateQuestStatus(
        roomId: string,
        questId: string,
        status: Quest['status']
    ): Promise<RoomRow | null> {
        // PostgreSQL JSONB операция — находим квест по ID и обновляем его статус
        const sql = `
            UPDATE rooms
            SET 
                active_quests = (
                    SELECT jsonb_agg(
                        CASE 
                            WHEN quest->>'id' = $2 
                            THEN jsonb_set(quest, '{status}', to_jsonb($3::text))
                            ELSE quest
                        END
                    )
                    FROM jsonb_array_elements(active_quests) as quest
                ),
                updated_at = NOW()
            WHERE id = $1
            RETURNING *
        `

        try {
            const result = await pool.query<RoomRow>(sql, [roomId, questId, status])
            return result.rows[0] ?? null
        } catch (error) {
            console.error('[RoomsRepository] Ошибка updateQuestStatus:', error)
            throw new Error('Не удалось обновить статус квеста')
        }
    }

    /**
     * Удаление комнаты
     */
    async delete(roomId: string): Promise<boolean> {
        const sql = 'DELETE FROM rooms WHERE id = $1 RETURNING id'

        try {
            const result = await pool.query(sql, [roomId])
            return result.rowCount !== null && result.rowCount > 0
        } catch (error) {
            console.error('[RoomsRepository] Ошибка delete:', error)
            throw new Error('Не удалось удалить комнату')
        }
    }

    /**
     * Проверка существования комнаты
     */
    async exists(roomId: string): Promise<boolean> {
        const sql = 'SELECT EXISTS(SELECT 1 FROM rooms WHERE id = $1) as exists'

        try {
            const result = await pool.query<{ exists: boolean }>(sql, [roomId])
            return result.rows[0].exists
        } catch (error) {
            console.error('[RoomsRepository] Ошибка exists:', error)
            throw new Error('Не удалось проверить существование комнаты')
        }
    }

    /**
     * Проверка является ли пользователь хостом комнаты
     */
    async isHost(roomId: string, userId: string): Promise<boolean> {
        const sql = `
            SELECT EXISTS(
                SELECT 1 FROM rooms 
                WHERE id = $1 AND host_user_id = $2
            ) as is_host
        `

        try {
            const result = await pool.query<{ is_host: boolean }>(sql, [roomId, userId])
            return result.rows[0].is_host
        } catch (error) {
            console.error('[RoomsRepository] Ошибка isHost:', error)
            throw new Error('Не удалось проверить права хоста')
        }
    }

    /**
     * Очистка старых завершённых комнат (для cronjob)
     */
    async deleteOldFinished(olderThanDays: number = 30): Promise<number> {
        const sql = `
            DELETE FROM rooms
            WHERE status = 'finished'
              AND updated_at < NOW() - INTERVAL '1 day' * $1
            RETURNING id
        `

        try {
            const result = await pool.query(sql, [olderThanDays])
            return result.rowCount ?? 0
        } catch (error) {
            console.error('[RoomsRepository] Ошибка deleteOldFinished:', error)
            throw new Error('Не удалось очистить старые комнаты')
        }
    }

    // ─── Приватные методы валидации ───────────────────────────────────────────

    private validateCreateData(data: CreateRoomData): void {
        if (!data.host_user_id || typeof data.host_user_id !== 'string') {
            throw new Error('host_user_id обязателен')
        }
    }

    private validateStatus(status: string): asserts status is RoomStatus {
        const validStatuses: RoomStatus[] = ['lobby', 'playing', 'paused', 'finished']
        if (!validStatuses.includes(status as RoomStatus)) {
            throw new Error(
                `Некорректный статус: ${status}. ` +
                `Допустимые: ${validStatuses.join(', ')}`
            )
        }
    }

    private validateTurnStatus(status: string): asserts status is TurnStatus {
        const validStatuses: TurnStatus[] = ['waiting', 'player_turn', 'dm_turn', 'resolving']
        if (!validStatuses.includes(status as TurnStatus)) {
            throw new Error(
                `Некорректный turn_status: ${status}. ` +
                `Допустимые: ${validStatuses.join(', ')}`
            )
        }
    }
}

// Экспортируем синглтон
export const roomsRepository = new RoomsRepository()