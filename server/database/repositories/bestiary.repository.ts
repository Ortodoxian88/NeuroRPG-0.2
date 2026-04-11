// server/database/repositories/bestiary.repository.ts

import { pool } from '../pool' // ← используем pool из предыдущего аудита
import { PoolClient } from 'pg'

// ─── Типы ─────────────────────────────────────────────────────────────────────

// Предполагаю структуру таблицы bestiary:
// Если реальная структура другая — скорректируй
export interface BestiaryRow {
    id: string
    slug: string
    title: string
    category: string
    content: string
    tags: string[]              // массив строк (PostgreSQL TEXT[] или JSONB)
    nature: string | null
    knowledge_level: number     // 1-5
    author_notes: string | null
    source_room_id: string | null
    discovered_by_user_id: string | null
    created_at: Date
    updated_at: Date
}

// Тип для создания записи (без автогенерируемых полей)
export type CreateBestiaryData = Omit<
    BestiaryRow,
    'id' | 'created_at' | 'updated_at'
>

// Тип для обновления (все поля опциональны)
export type UpdateBestiaryData = Partial<
    Omit<BestiaryRow, 'id' | 'created_at' | 'updated_at'>
>

// ─── Репозиторий ──────────────────────────────────────────────────────────────

export class BestiaryRepository {
    /**
     * Поиск записей в бестиарии
     * @param search - текст для поиска (в title и tags)
     * @param category - фильтр по категории
     */
    async search(search?: string, category?: string): Promise<BestiaryRow[]> {
        // Динамически строим WHERE условия
        const conditions: string[] = []
        const params: (string | number)[] = []

        if (search && search.trim()) {
            // Защита от SQL injection через параметризованный запрос
            const searchPattern = `%${search.trim()}%`
            params.push(searchPattern)

            // ВАЖНО: проверь тип колонки tags в БД
            // Если TEXT[] — используй @> ARRAY[$N]::text[]
            // Если JSONB — используй tags ? $N или tags @> $N
            // Сейчас предполагаю TEXT[]
            conditions.push(`
                (
                    title ILIKE $${params.length}
                    OR $${params.length} ILIKE ANY(tags)
                )
            `)
        }

        if (category && category.trim()) {
            params.push(category.trim())
            conditions.push(`category = $${params.length}`)
        }

        // WHERE строится только если есть условия
        const whereClause = conditions.length > 0
            ? `WHERE ${conditions.join(' AND ')}`
            : ''

        const sql = `
            SELECT *
            FROM bestiary
            ${whereClause}
            ORDER BY created_at DESC
        `

        try {
            const result = await pool.query<BestiaryRow>(sql, params)
            return result.rows
        } catch (error) {
            console.error('[BestiaryRepository] Ошибка поиска:', error)
            throw new Error('Не удалось выполнить поиск в бестиарии')
        }
    }

    /**
     * Поиск по ID
     */
    async findById(id: string): Promise<BestiaryRow | null> {
        const sql = 'SELECT * FROM bestiary WHERE id = $1'

        try {
            const result = await pool.query<BestiaryRow>(sql, [id])
            return result.rows[0] ?? null
        } catch (error) {
            console.error('[BestiaryRepository] Ошибка findById:', error)
            throw new Error('Не удалось найти запись бестиария')
        }
    }

    /**
     * Поиск по slug
     */
    async findBySlug(slug: string): Promise<BestiaryRow | null> {
        const sql = 'SELECT * FROM bestiary WHERE slug = $1'

        try {
            const result = await pool.query<BestiaryRow>(sql, [slug])
            return result.rows[0] ?? null
        } catch (error) {
            console.error('[BestiaryRepository] Ошибка findBySlug:', error)
            throw new Error('Не удалось найти запись по slug')
        }
    }

    /**
     * Создание записи
     */
    async create(data: CreateBestiaryData): Promise<BestiaryRow> {
        // Валидация обязательных полей
        this.validateCreateData(data)

        const sql = `
            INSERT INTO bestiary (
                slug,
                title,
                category,
                content,
                tags,
                nature,
                knowledge_level,
                author_notes,
                source_room_id,
                discovered_by_user_id,
                created_at,
                updated_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW())
            RETURNING *
        `

        const params = [
            data.slug,
            data.title,
            data.category,
            data.content,
            // ВАЖНО: если tags = TEXT[] в БД — передаём как есть (массив)
            // PostgreSQL автоматически сконвертирует JS массив в TEXT[]
            // Если tags = JSONB — нужен JSON.stringify(data.tags || [])
            data.tags || [],
            data.nature ?? null,
            data.knowledge_level,
            data.author_notes ?? null,
            data.source_room_id ?? null,
            data.discovered_by_user_id ?? null,
        ]

        try {
            const result = await pool.query<BestiaryRow>(sql, params)
            return result.rows[0]
        } catch (error) {
            // PostgreSQL ошибки имеют свойство code
            const pgError = error as { code?: string; detail?: string }

            // 23505 = unique violation (slug уже существует)
            if (pgError.code === '23505') {
                throw new Error(`Запись с slug "${data.slug}" уже существует`)
            }

            console.error('[BestiaryRepository] Ошибка create:', error)
            throw new Error('Не удалось создать запись бестиария')
        }
    }

    /**
     * Создание с использованием транзакции (для вызова из withTransaction)
     */
    async createWithClient(
        client: PoolClient,
        data: CreateBestiaryData
    ): Promise<BestiaryRow> {
        this.validateCreateData(data)

        const sql = `
            INSERT INTO bestiary (
                slug, title, category, content, tags, nature,
                knowledge_level, author_notes, source_room_id,
                discovered_by_user_id, created_at, updated_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW())
            RETURNING *
        `

        const params = [
            data.slug,
            data.title,
            data.category,
            data.content,
            data.tags || [],
            data.nature ?? null,
            data.knowledge_level,
            data.author_notes ?? null,
            data.source_room_id ?? null,
            data.discovered_by_user_id ?? null,
        ]

        const result = await client.query<BestiaryRow>(sql, params)
        return result.rows[0]
    }

    /**
     * Обновление записи
     */
    async update(id: string, data: UpdateBestiaryData): Promise<BestiaryRow | null> {
        // Строим динамический UPDATE только для переданных полей
        const updates: string[] = []
        const params: (string | number | string[] | null)[] = []

        if (data.title !== undefined) {
            params.push(data.title)
            updates.push(`title = $${params.length}`)
        }

        if (data.content !== undefined) {
            params.push(data.content)
            updates.push(`content = $${params.length}`)
        }

        if (data.tags !== undefined) {
            params.push(data.tags)
            updates.push(`tags = $${params.length}`)
        }

        if (data.category !== undefined) {
            params.push(data.category)
            updates.push(`category = $${params.length}`)
        }

        if (data.nature !== undefined) {
            params.push(data.nature)
            updates.push(`nature = $${params.length}`)
        }

        if (data.knowledge_level !== undefined) {
            params.push(data.knowledge_level)
            updates.push(`knowledge_level = $${params.length}`)
        }

        if (data.author_notes !== undefined) {
            params.push(data.author_notes)
            updates.push(`author_notes = $${params.length}`)
        }

        // Если нечего обновлять — возвращаем текущую запись
        if (updates.length === 0) {
            return this.findById(id)
        }

        // Добавляем updated_at
        updates.push('updated_at = NOW()')

        // ID добавляем последним параметром
        params.push(id)

        const sql = `
            UPDATE bestiary
            SET ${updates.join(', ')}
            WHERE id = $${params.length}
            RETURNING *
        `

        try {
            const result = await pool.query<BestiaryRow>(sql, params)
            return result.rows[0] ?? null
        } catch (error) {
            console.error('[BestiaryRepository] Ошибка update:', error)
            throw new Error('Не удалось обновить запись бестиария')
        }
    }

    /**
     * Удаление записи
     */
    async delete(id: string): Promise<boolean> {
        const sql = 'DELETE FROM bestiary WHERE id = $1 RETURNING id'

        try {
            const result = await pool.query(sql, [id])
            return result.rowCount !== null && result.rowCount > 0
        } catch (error) {
            console.error('[BestiaryRepository] Ошибка delete:', error)
            throw new Error('Не удалось удалить запись бестиария')
        }
    }

    /**
     * Получить все записи открытые конкретным пользователем
     */
    async findByDiscoverer(userId: string): Promise<BestiaryRow[]> {
        const sql = `
            SELECT *
            FROM bestiary
            WHERE discovered_by_user_id = $1
            ORDER BY created_at DESC
        `

        try {
            const result = await pool.query<BestiaryRow>(sql, [userId])
            return result.rows
        } catch (error) {
            console.error('[BestiaryRepository] Ошибка findByDiscoverer:', error)
            throw new Error('Не удалось получить записи бестиария пользователя')
        }
    }

    /**
     * Получить все записи из конкретной комнаты
     */
    async findByRoom(roomId: string): Promise<BestiaryRow[]> {
        const sql = `
            SELECT *
            FROM bestiary
            WHERE source_room_id = $1
            ORDER BY created_at DESC
        `

        try {
            const result = await pool.query<BestiaryRow>(sql, [roomId])
            return result.rows
        } catch (error) {
            console.error('[BestiaryRepository] Ошибка findByRoom:', error)
            throw new Error('Не удалось получить записи бестиария комнаты')
        }
    }

    /**
     * Валидация данных для создания
     */
    private validateCreateData(data: CreateBestiaryData): void {
        const errors: string[] = []

        if (!data.slug || typeof data.slug !== 'string' || data.slug.trim().length === 0) {
            errors.push('slug обязателен')
        }

        if (!data.title || typeof data.title !== 'string' || data.title.trim().length === 0) {
            errors.push('title обязателен')
        }

        if (!data.category || typeof data.category !== 'string') {
            errors.push('category обязательна')
        }

        if (!data.content || typeof data.content !== 'string') {
            errors.push('content обязателен')
        }

        if (
            data.knowledge_level === undefined ||
            typeof data.knowledge_level !== 'number' ||
            data.knowledge_level < 1 ||
            data.knowledge_level > 5
        ) {
            errors.push('knowledge_level должен быть числом от 1 до 5')
        }

        if (data.tags && !Array.isArray(data.tags)) {
            errors.push('tags должен быть массивом')
        }

        if (errors.length > 0) {
            throw new Error(`Ошибка валидации: ${errors.join(', ')}`)
        }
    }
}

// Экспортируем синглтон
export const bestiaryRepository = new BestiaryRepository()