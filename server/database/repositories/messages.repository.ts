// server/database/repositories/messages.repository.ts

import { pool } from '../pool'
import { PoolClient } from 'pg'

// ─── Типы ─────────────────────────────────────────────────────────────────────

/**
 * Строка таблицы messages из БД
 */
export interface MessageRow {
    id: string
    room_id: string
    user_id: string | null        // null = системное сообщение или AI
    type: MessageType
    content: string
    metadata: MessageMetadata
    turn_number: number
    created_at: Date
}

/**
 * Типы сообщений
 */
export type MessageType = 
    | 'player_action'      // действие игрока
    | 'dm_response'        // ответ мастера (AI)
    | 'system'             // системное (вход/выход/начало игры)
    | 'combat'             // боевое действие
    | 'narrative'          // нарратив без механики

/**
 * Метаданные сообщения (хранятся как JSONB в БД)
 */
export interface MessageMetadata {
    // Для player_action
    action_type?: 'attack' | 'defend' | 'speak' | 'investigate' | 'move' | 'use_item'
    target?: string
    
    // Для dm_response
    dice_rolls?: Array<{
        type: string        // 'd20', '2d6', etc
        result: number
        critical?: boolean
    }>
    
    // Для combat
    damage_dealt?: number
    damage_received?: number
    
    // Общие
    tags?: string[]
    important?: boolean
    edited?: boolean
    
    // Расширяемость
    [key: string]: unknown
}

/**
 * Данные для создания сообщения
 */
export interface CreateMessageData {
    room_id: string
    user_id: string | null
    type: MessageType
    content: string
    metadata?: MessageMetadata
    turn_number: number
}

/**
 * Данные для обновления сообщения
 */
export interface UpdateMessageData {
    content?: string
    metadata?: MessageMetadata
}

/**
 * Результат пагинации
 */
export interface PaginatedMessages {
    messages: MessageRow[]
    total: number
    page: number
    pageSize: number
    hasMore: boolean
}

// ─── Репозиторий ──────────────────────────────────────────────────────────────

export class MessagesRepository {
    /**
     * Создание сообщения
     */
    async create(data: CreateMessageData): Promise<MessageRow> {
        this.validateCreateData(data)

        const sql = `
            INSERT INTO messages (
                room_id,
                user_id,
                type,
                content,
                metadata,
                turn_number,
                created_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, NOW())
            RETURNING *
        `

        const params = [
            data.room_id,
            data.user_id,
            data.type,
            data.content,
            // JSONB автоматически парсится PostgreSQL
            // Не нужен JSON.stringify если колонка типа JSONB
            data.metadata || {},
            data.turn_number,
        ]

        try {
            const result = await pool.query<MessageRow>(sql, params)
            return result.rows[0]
        } catch (error) {
            const pgError = error as { code?: string; constraint?: string }

            // 23503 = foreign key violation (room_id или user_id не существует)
            if (pgError.code === '23503') {
                if (pgError.constraint?.includes('room')) {
                    throw new Error(`Комната ${data.room_id} не найдена`)
                }
                if (pgError.constraint?.includes('user')) {
                    throw new Error(`Пользователь ${data.user_id} не найден`)
                }
            }

            console.error('[MessagesRepository] Ошибка create:', error)
            throw new Error('Не удалось создать сообщение')
        }
    }

    /**
     * Создание с использованием транзакции
     */
    async createWithClient(
        client: PoolClient,
        data: CreateMessageData
    ): Promise<MessageRow> {
        this.validateCreateData(data)

        const sql = `
            INSERT INTO messages (
                room_id, user_id, type, content, metadata, turn_number, created_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, NOW())
            RETURNING *
        `

        const params = [
            data.room_id,
            data.user_id,
            data.type,
            data.content,
            data.metadata || {},
            data.turn_number,
        ]

        const result = await client.query<MessageRow>(sql, params)
        return result.rows[0]
    }

    /**
     * Поиск сообщения по ID
     */
    async findById(messageId: string): Promise<MessageRow | null> {
        const sql = 'SELECT * FROM messages WHERE id = $1'

        try {
            const result = await pool.query<MessageRow>(sql, [messageId])
            return result.rows[0] ?? null
        } catch (error) {
            console.error('[MessagesRepository] Ошибка findById:', error)
            throw new Error('Не удалось найти сообщение')
        }
    }

    /**
     * Получить сообщения комнаты с пагинацией
     * @param roomId - ID комнаты
     * @param page - номер страницы (с 1)
     * @param pageSize - размер страницы
     */
    async findByRoom(
        roomId: string,
        page: number = 1,
        pageSize: number = 50
    ): Promise<PaginatedMessages> {
        // Валидация параметров пагинации
        const validatedPage = Math.max(1, Math.floor(page))
        const validatedPageSize = Math.max(1, Math.min(100, Math.floor(pageSize)))
        const offset = (validatedPage - 1) * validatedPageSize

        // Получаем сообщения и общее количество одним запросом
        const sql = `
            SELECT 
                *,
                COUNT(*) OVER() as total_count
            FROM messages
            WHERE room_id = $1
            ORDER BY created_at ASC
            LIMIT $2 OFFSET $3
        `

        try {
            const result = await pool.query<MessageRow & { total_count: string }>(
                sql,
                [roomId, validatedPageSize, offset]
            )

            const messages = result.rows.map(row => {
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
                const { total_count, ...message } = row
                return message as MessageRow
            })

            const total = result.rows.length > 0 
                ? parseInt(result.rows[0].total_count, 10) 
                : 0

            return {
                messages,
                total,
                page: validatedPage,
                pageSize: validatedPageSize,
                hasMore: offset + messages.length < total,
            }
        } catch (error) {
            console.error('[MessagesRepository] Ошибка findByRoom:', error)
            throw new Error('Не удалось получить сообщения комнаты')
        }
    }

    /**
     * Получить последние N сообщений комнаты (для AI промпта)
     * Без пагинации, просто последние
     */
    async getRecent(roomId: string, limit: number = 20): Promise<MessageRow[]> {
        const validatedLimit = Math.max(1, Math.min(100, Math.floor(limit)))

        const sql = `
            SELECT *
            FROM messages
            WHERE room_id = $1
            ORDER BY created_at DESC
            LIMIT $2
        `

        try {
            const result = await pool.query<MessageRow>(sql, [roomId, validatedLimit])
            // Разворачиваем обратно в хронологический порядок
            return result.rows.reverse()
        } catch (error) {
            console.error('[MessagesRepository] Ошибка getRecent:', error)
            throw new Error('Не удалось получить последние сообщения')
        }
    }

    /**
     * Получить последнее сообщение в комнате
     */
    async getLastMessage(roomId: string): Promise<MessageRow | null> {
        const sql = `
            SELECT *
            FROM messages
            WHERE room_id = $1
            ORDER BY created_at DESC
            LIMIT 1
        `

        try {
            const result = await pool.query<MessageRow>(sql, [roomId])
            return result.rows[0] ?? null
        } catch (error) {
            console.error('[MessagesRepository] Ошибка getLastMessage:', error)
            throw new Error('Не удалось получить последнее сообщение')
        }
    }

    /**
     * Получить сообщения конкретного хода
     */
    async findByTurn(roomId: string, turnNumber: number): Promise<MessageRow[]> {
        const sql = `
            SELECT *
            FROM messages
            WHERE room_id = $1 AND turn_number = $2
            ORDER BY created_at ASC
        `

        try {
            const result = await pool.query<MessageRow>(sql, [roomId, turnNumber])
            return result.rows
        } catch (error) {
            console.error('[MessagesRepository] Ошибка findByTurn:', error)
            throw new Error('Не удалось получить сообщения хода')
        }
    }

    /**
     * Получить все сообщения пользователя в комнате
     */
    async findByUser(roomId: string, userId: string): Promise<MessageRow[]> {
        const sql = `
            SELECT *
            FROM messages
            WHERE room_id = $1 AND user_id = $2
            ORDER BY created_at ASC
        `

        try {
            const result = await pool.query<MessageRow>(sql, [roomId, userId])
            return result.rows
        } catch (error) {
            console.error('[MessagesRepository] Ошибка findByUser:', error)
            throw new Error('Не удалось получить сообщения пользователя')
        }
    }

    /**
     * Получить количество сообщений в комнате
     */
    async countByRoom(roomId: string): Promise<number> {
        const sql = 'SELECT COUNT(*) as count FROM messages WHERE room_id = $1'

        try {
            const result = await pool.query<{ count: string }>(sql, [roomId])
            return parseInt(result.rows[0].count, 10)
        } catch (error) {
            console.error('[MessagesRepository] Ошибка countByRoom:', error)
            throw new Error('Не удалось подсчитать сообщения')
        }
    }

    /**
     * Обновление сообщения (редактирование)
     */
    async update(
        messageId: string,
        data: UpdateMessageData
    ): Promise<MessageRow | null> {
        const updates: string[] = []
        const params: (string | MessageMetadata)[] = []

        if (data.content !== undefined) {
            params.push(data.content)
            updates.push(`content = $${params.length}`)
        }

        if (data.metadata !== undefined) {
            params.push(data.metadata)
            updates.push(`metadata = $${params.length}`)
        }

        if (updates.length === 0) {
            return this.findById(messageId)
        }

        // Помечаем что сообщение было отредактировано
        updates.push(`metadata = metadata || '{"edited": true}'::jsonb`)

        params.push(messageId)

        const sql = `
            UPDATE messages
            SET ${updates.join(', ')}
            WHERE id = $${params.length}
            RETURNING *
        `

        try {
            const result = await pool.query<MessageRow>(sql, params)
            return result.rows[0] ?? null
        } catch (error) {
            console.error('[MessagesRepository] Ошибка update:', error)
            throw new Error('Не удалось обновить сообщение')
        }
    }

    /**
     * Удаление сообщения
     */
    async delete(messageId: string): Promise<boolean> {
        const sql = 'DELETE FROM messages WHERE id = $1 RETURNING id'

        try {
            const result = await pool.query(sql, [messageId])
            return result.rowCount !== null && result.rowCount > 0
        } catch (error) {
            console.error('[MessagesRepository] Ошибка delete:', error)
            throw new Error('Не удалось удалить сообщение')
        }
    }

    /**
     * Удалить все сообщения комнаты (при удалении комнаты)
     */
    async deleteByRoom(roomId: string): Promise<number> {
        const sql = 'DELETE FROM messages WHERE room_id = $1'

        try {
            const result = await pool.query(sql, [roomId])
            return result.rowCount ?? 0
        } catch (error) {
            console.error('[MessagesRepository] Ошибка deleteByRoom:', error)
            throw new Error('Не удалось удалить сообщения комнаты')
        }
    }

    /**
     * Поиск по содержимому (full-text search)
     * Требует GIN индекс: CREATE INDEX idx_messages_content_search 
     * ON messages USING GIN(to_tsvector('russian', content))
     */
    async search(roomId: string, searchQuery: string): Promise<MessageRow[]> {
        const sql = `
            SELECT *,
                   ts_rank(to_tsvector('russian', content), plainto_tsquery('russian', $2)) as rank
            FROM messages
            WHERE room_id = $1
              AND to_tsvector('russian', content) @@ plainto_tsquery('russian', $2)
            ORDER BY rank DESC, created_at DESC
            LIMIT 50
        `

        try {
            const result = await pool.query<MessageRow & { rank: number }>(sql, [
                roomId,
                searchQuery,
            ])

            return result.rows.map(row => {
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
                const { rank, ...message } = row
                return message as MessageRow
            })
        } catch (error) {
            console.error('[MessagesRepository] Ошибка search:', error)
            throw new Error('Не удалось выполнить поиск')
        }
    }

    /**
     * Валидация данных для создания
     */
    private validateCreateData(data: CreateMessageData): void {
        const errors: string[] = []

        if (!data.room_id || typeof data.room_id !== 'string') {
            errors.push('room_id обязателен')
        }

        if (!data.type || typeof data.type !== 'string') {
            errors.push('type обязателен')
        }

        const validTypes: MessageType[] = [
            'player_action',
            'dm_response',
            'system',
            'combat',
            'narrative',
        ]
        if (!validTypes.includes(data.type as MessageType)) {
            errors.push(`type должен быть одним из: ${validTypes.join(', ')}`)
        }

        if (!data.content || typeof data.content !== 'string') {
            errors.push('content обязателен')
        }

        if (data.content && data.content.length > 10000) {
            errors.push('content не может быть длиннее 10000 символов')
        }

        if (typeof data.turn_number !== 'number' || data.turn_number < 0) {
            errors.push('turn_number должен быть неотрицательным числом')
        }

        if (errors.length > 0) {
            throw new Error(`Ошибка валидации: ${errors.join(', ')}`)
        }
    }
}

// Экспортируем синглтон
export const messagesRepository = new MessagesRepository()