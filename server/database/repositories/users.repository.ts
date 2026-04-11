// server/database/repositories/users.repository.ts

import { pool } from '../pool'
import { PoolClient } from 'pg'

// ─── Типы ─────────────────────────────────────────────────────────────────────

/**
 * Строка таблицы users из БД
 */
export interface UserRow {
    id: string
    google_id: string
    email: string
    display_name: string | null
    avatar_url: string | null
    last_seen_at: Date
    created_at: Date
    updated_at: Date
}

/**
 * Данные для upsert пользователя через Google OAuth
 */
export interface UpsertUserByGoogleData {
    googleId: string
    email: string
    displayName: string | null
    avatarUrl: string | null
}

/**
 * Данные для обновления профиля пользователя
 */
export interface UpdateUserData {
    display_name?: string | null
    avatar_url?: string | null
}

/**
 * Публичный профиль пользователя (без sensitive данных)
 */
export interface PublicUserProfile {
    id: string
    display_name: string | null
    avatar_url: string | null
}

// ─── Утилиты валидации ────────────────────────────────────────────────────────

/**
 * Простая валидация email
 */
function isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    return emailRegex.test(email)
}

// ─── Репозиторий ──────────────────────────────────────────────────────────────

export class UsersRepository {
    /**
     * Создание или обновление пользователя через Google OAuth
     * Использует ON CONFLICT для idempotent операции
     */
    async upsertByGoogleId(data: UpsertUserByGoogleData): Promise<UserRow> {
        this.validateUpsertData(data)

        const sql = `
            INSERT INTO users (
                google_id,
                email,
                display_name,
                avatar_url,
                last_seen_at,
                created_at,
                updated_at
            )
            VALUES ($1, $2, $3, $4, NOW(), NOW(), NOW())
            ON CONFLICT (google_id) DO UPDATE SET
                email = EXCLUDED.email,
                display_name = EXCLUDED.display_name,
                avatar_url = EXCLUDED.avatar_url,
                last_seen_at = NOW(),
                updated_at = NOW()
            RETURNING *
        `

        const params = [
            data.googleId,
            data.email,
            data.displayName,
            data.avatarUrl,
        ]

        try {
            const result = await pool.query<UserRow>(sql, params)
            return result.rows[0]
        } catch (error) {
            const pgError = error as { code?: string; constraint?: string }

            // 23505 = unique violation (email уже используется другим аккаунтом)
            if (pgError.code === '23505' && pgError.constraint?.includes('email')) {
                throw new Error(
                    `Email ${data.email} уже используется другим Google аккаунтом`
                )
            }

            console.error('[UsersRepository] Ошибка upsertByGoogleId:', error)
            throw new Error('Не удалось создать/обновить пользователя')
        }
    }

    /**
     * Upsert с использованием транзакции
     */
    async upsertByGoogleIdWithClient(
        client: PoolClient,
        data: UpsertUserByGoogleData
    ): Promise<UserRow> {
        this.validateUpsertData(data)

        const sql = `
            INSERT INTO users (
                google_id, email, display_name, avatar_url,
                last_seen_at, created_at, updated_at
            )
            VALUES ($1, $2, $3, $4, NOW(), NOW(), NOW())
            ON CONFLICT (google_id) DO UPDATE SET
                email = EXCLUDED.email,
                display_name = EXCLUDED.display_name,
                avatar_url = EXCLUDED.avatar_url,
                last_seen_at = NOW(),
                updated_at = NOW()
            RETURNING *
        `

        const params = [data.googleId, data.email, data.displayName, data.avatarUrl]
        const result = await client.query<UserRow>(sql, params)
        return result.rows[0]
    }

    /**
     * Поиск пользователя по внутреннему ID
     */
    async findById(userId: string): Promise<UserRow | null> {
        const sql = 'SELECT * FROM users WHERE id = $1'

        try {
            const result = await pool.query<UserRow>(sql, [userId])
            return result.rows[0] ?? null
        } catch (error) {
            console.error('[UsersRepository] Ошибка findById:', error)
            throw new Error('Не удалось найти пользователя')
        }
    }

    /**
     * Поиск пользователя по Google ID
     */
    async findByGoogleId(googleId: string): Promise<UserRow | null> {
        const sql = 'SELECT * FROM users WHERE google_id = $1'

        try {
            const result = await pool.query<UserRow>(sql, [googleId])
            return result.rows[0] ?? null
        } catch (error) {
            console.error('[UsersRepository] Ошибка findByGoogleId:', error)
            throw new Error('Не удалось найти пользователя по Google ID')
        }
    }

    /**
     * Поиск пользователя по email
     */
    async findByEmail(email: string): Promise<UserRow | null> {
        if (!isValidEmail(email)) {
            throw new Error('Некорректный email')
        }

        const sql = 'SELECT * FROM users WHERE email = $1'

        try {
            const result = await pool.query<UserRow>(sql, [email])
            return result.rows[0] ?? null
        } catch (error) {
            console.error('[UsersRepository] Ошибка findByEmail:', error)
            throw new Error('Не удалось найти пользователя по email')
        }
    }

    /**
     * Получить несколько пользователей по ID (для отображения списка игроков)
     */
    async findByIds(userIds: string[]): Promise<UserRow[]> {
        if (userIds.length === 0) {
            return []
        }

        // Убираем дубликаты
        const uniqueIds = [...new Set(userIds)]

        const sql = `
            SELECT *
            FROM users
            WHERE id = ANY($1::uuid[])
        `

        try {
            const result = await pool.query<UserRow>(sql, [uniqueIds])
            return result.rows
        } catch (error) {
            console.error('[UsersRepository] Ошибка findByIds:', error)
            throw new Error('Не удалось получить пользователей')
        }
    }

    /**
     * Получить публичные профили пользователей (без sensitive данных)
     */
    async getPublicProfiles(userIds: string[]): Promise<PublicUserProfile[]> {
        if (userIds.length === 0) {
            return []
        }

        const uniqueIds = [...new Set(userIds)]

        const sql = `
            SELECT id, display_name, avatar_url
            FROM users
            WHERE id = ANY($1::uuid[])
        `

        try {
            const result = await pool.query<PublicUserProfile>(sql, [uniqueIds])
            return result.rows
        } catch (error) {
            console.error('[UsersRepository] Ошибка getPublicProfiles:', error)
            throw new Error('Не удалось получить публичные профили')
        }
    }

    /**
     * Обновление профиля пользователя
     */
    async update(userId: string, data: UpdateUserData): Promise<UserRow | null> {
        const updates: string[] = []
        const params: (string | null)[] = []

        if (data.display_name !== undefined) {
            params.push(data.display_name)
            updates.push(`display_name = $${params.length}`)
        }

        if (data.avatar_url !== undefined) {
            params.push(data.avatar_url)
            updates.push(`avatar_url = $${params.length}`)
        }

        if (updates.length === 0) {
            return this.findById(userId)
        }

        updates.push('updated_at = NOW()')
        params.push(userId)

        const sql = `
            UPDATE users
            SET ${updates.join(', ')}
            WHERE id = $${params.length}
            RETURNING *
        `

        try {
            const result = await pool.query<UserRow>(sql, params)
            return result.rows[0] ?? null
        } catch (error) {
            console.error('[UsersRepository] Ошибка update:', error)
            throw new Error('Не удалось обновить профиль пользователя')
        }
    }

    /**
     * Обновить last_seen_at (для activity tracking)
     * Оптимизация: обновляем только если last_seen старше 5 минут
     */
    async updateLastSeen(userId: string): Promise<void> {
        const sql = `
            UPDATE users
            SET last_seen_at = NOW()
            WHERE id = $1
              AND last_seen_at < NOW() - INTERVAL '5 minutes'
        `

        try {
            await pool.query(sql, [userId])
            // Не проверяем rowCount — если не обновилось, значит недавно был онлайн
        } catch (error) {
            // Ошибка не критична — логируем и продолжаем
            console.error('[UsersRepository] Ошибка updateLastSeen:', error)
        }
    }

    /**
     * Получить активных пользователей (были онлайн за последние N минут)
     */
    async findActive(withinMinutes: number = 30): Promise<UserRow[]> {
        const sql = `
            SELECT *
            FROM users
            WHERE last_seen_at > NOW() - INTERVAL '1 minute' * $1
            ORDER BY last_seen_at DESC
        `

        try {
            const result = await pool.query<UserRow>(sql, [withinMinutes])
            return result.rows
        } catch (error) {
            console.error('[UsersRepository] Ошибка findActive:', error)
            throw new Error('Не удалось получить активных пользователей')
        }
    }

    /**
     * Получить недавно зарегистрированных пользователей
     */
    async findRecent(limit: number = 10): Promise<UserRow[]> {
        const validatedLimit = Math.max(1, Math.min(100, Math.floor(limit)))

        const sql = `
            SELECT *
            FROM users
            ORDER BY created_at DESC
            LIMIT $1
        `

        try {
            const result = await pool.query<UserRow>(sql, [validatedLimit])
            return result.rows
        } catch (error) {
            console.error('[UsersRepository] Ошибка findRecent:', error)
            throw new Error('Не удалось получить недавних пользователей')
        }
    }

    /**
     * Получить общее количество пользователей
     */
    async count(): Promise<number> {
        const sql = 'SELECT COUNT(*) as count FROM users'

        try {
            const result = await pool.query<{ count: string }>(sql)
            return parseInt(result.rows[0].count, 10)
        } catch (error) {
            console.error('[UsersRepository] Ошибка count:', error)
            throw new Error('Не удалось подсчитать пользователей')
        }
    }

    /**
     * Удаление пользователя (GDPR compliance)
     */
    async delete(userId: string): Promise<boolean> {
        const sql = 'DELETE FROM users WHERE id = $1 RETURNING id'

        try {
            const result = await pool.query(sql, [userId])
            return result.rowCount !== null && result.rowCount > 0
        } catch (error) {
            const pgError = error as { code?: string }

            // 23503 = foreign key violation (есть связанные записи)
            if (pgError.code === '23503') {
                throw new Error(
                    'Невозможно удалить пользователя: есть связанные данные ' +
                    '(комнаты, сообщения, персонажи). Сначала удалите их или ' +
                    'настройте CASCADE.'
                )
            }

            console.error('[UsersRepository] Ошибка delete:', error)
            throw new Error('Не удалось удалить пользователя')
        }
    }

    /**
     * Проверка существования пользователя
     */
    async exists(userId: string): Promise<boolean> {
        const sql = 'SELECT EXISTS(SELECT 1 FROM users WHERE id = $1) as exists'

        try {
            const result = await pool.query<{ exists: boolean }>(sql, [userId])
            return result.rows[0].exists
        } catch (error) {
            console.error('[UsersRepository] Ошибка exists:', error)
            throw new Error('Не удалось проверить существование пользователя')
        }
    }

    /**
     * Проверка существования пользователя по Google ID
     */
    async existsByGoogleId(googleId: string): Promise<boolean> {
        const sql = 'SELECT EXISTS(SELECT 1 FROM users WHERE google_id = $1) as exists'

        try {
            const result = await pool.query<{ exists: boolean }>(sql, [googleId])
            return result.rows[0].exists
        } catch (error) {
            console.error('[UsersRepository] Ошибка existsByGoogleId:', error)
            throw new Error('Не удалось проверить существование пользователя')
        }
    }

    /**
     * Поиск пользователей по имени (для автодополнения)
     */
    async searchByName(query: string, limit: number = 10): Promise<UserRow[]> {
        if (!query || query.trim().length === 0) {
            return []
        }

        const validatedLimit = Math.max(1, Math.min(50, Math.floor(limit)))
        const searchPattern = `%${query.trim()}%`

        const sql = `
            SELECT *
            FROM users
            WHERE display_name ILIKE $1
            ORDER BY 
                CASE 
                    WHEN display_name ILIKE $2 THEN 0  -- точное совпадение в начале
                    ELSE 1
                END,
                display_name
            LIMIT $3
        `

        try {
            const result = await pool.query<UserRow>(sql, [
                searchPattern,
                `${query.trim()}%`, // для приоритета совпадений с начала
                validatedLimit,
            ])
            return result.rows
        } catch (error) {
            console.error('[UsersRepository] Ошибка searchByName:', error)
            throw new Error('Не удалось выполнить поиск пользователей')
        }
    }

    /**
     * Получить статистику пользователя
     */
    async getStats(userId: string): Promise<{
        roomsHosted: number
        roomsParticipated: number
        messagesSent: number
        joinedAt: Date
        lastSeenAt: Date
    } | null> {
        const sql = `
            SELECT 
                u.created_at as joined_at,
                u.last_seen_at,
                (SELECT COUNT(*) FROM rooms WHERE host_user_id = u.id) as rooms_hosted,
                (SELECT COUNT(DISTINCT room_id) FROM players WHERE user_id = u.id) as rooms_participated,
                (SELECT COUNT(*) FROM messages WHERE user_id = u.id) as messages_sent
            FROM users u
            WHERE u.id = $1
        `

        try {
            const result = await pool.query<{
                joined_at: Date
                last_seen_at: Date
                rooms_hosted: string
                rooms_participated: string
                messages_sent: string
            }>(sql, [userId])

            if (result.rows.length === 0) {
                return null
            }

            const row = result.rows[0]
            return {
                joinedAt: row.joined_at,
                lastSeenAt: row.last_seen_at,
                roomsHosted: parseInt(row.rooms_hosted, 10),
                roomsParticipated: parseInt(row.rooms_participated, 10),
                messagesSent: parseInt(row.messages_sent, 10),
            }
        } catch (error) {
            console.error('[UsersRepository] Ошибка getStats:', error)
            throw new Error('Не удалось получить статистику пользователя')
        }
    }

    // ─── Приватные методы валидации ───────────────────────────────────────────

    private validateUpsertData(data: UpsertUserByGoogleData): void {
        const errors: string[] = []

        if (!data.googleId || typeof data.googleId !== 'string') {
            errors.push('googleId обязателен')
        }

        if (!data.email || typeof data.email !== 'string') {
            errors.push('email обязателен')
        } else if (!isValidEmail(data.email)) {
            errors.push('некорректный формат email')
        }

        if (data.displayName !== null && typeof data.displayName !== 'string') {
            errors.push('displayName должен быть строкой или null')
        }

        if (data.avatarUrl !== null && typeof data.avatarUrl !== 'string') {
            errors.push('avatarUrl должен быть строкой или null')
        }

        if (errors.length > 0) {
            throw new Error(`Ошибка валидации: ${errors.join(', ')}`)
        }
    }
}

// Экспортируем синглтон
export const usersRepository = new UsersRepository()