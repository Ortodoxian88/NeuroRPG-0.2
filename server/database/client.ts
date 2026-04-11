// server/database/pool.ts

import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg'
import 'dotenv/config'

// ─── Константы ────────────────────────────────────────────────────────────────

const DATABASE_URL = process.env.DATABASE_URL
const NODE_ENV = process.env.NODE_ENV || 'development'
const IS_PRODUCTION = NODE_ENV === 'production'

// Supabase free tier: max 60 соединений на всю БД
// Если запущено несколько инстансов приложения — делим между ними
// 10 соединений на инстанс = запас для 6 инстансов
const POOL_CONFIG = {
    development: {
        max: 5,              // для dev достаточно
        min: 1,
        ssl: false,          // локальный PostgreSQL обычно без SSL
    },
    production: {
        max: 10,             // для продакшена больше
        min: 2,              // держим 2 соединения всегда открытыми
        ssl: {
            rejectUnauthorized: false,  // Supabase/Render требуют SSL
        },
    },
}

// ─── Валидация DATABASE_URL ───────────────────────────────────────────────────

if (!DATABASE_URL) {
    console.error('[DB] ❌ DATABASE_URL не задан в переменных окружения!')
    console.error('[DB] Приложение не сможет работать с БД.')
    
    // В продакшене — падаем сразу
    if (IS_PRODUCTION) {
        console.error('[DB] Завершение процесса (production mode).')
        process.exit(1)
    }
}

// ─── Создание пула ────────────────────────────────────────────────────────────

const config = IS_PRODUCTION ? POOL_CONFIG.production : POOL_CONFIG.development

export const pool = new Pool({
    connectionString: DATABASE_URL,
    
    // Размер пула
    max: config.max,
    min: config.min,
    
    // SSL
    ssl: config.ssl,
    
    // Таймауты
    idleTimeoutMillis: 30000,        // закрываем idle соединения через 30 сек
    connectionTimeoutMillis: 10000,  // таймаут получения соединения из пула
    
    // Настройки подключения
    // query_timeout отключен — длинные AI запросы могут идти >30 сек
    // statement_timeout управляется на уровне БД если нужен
})

// ─── Логирование событий пула ─────────────────────────────────────────────────

pool.on('connect', (client) => {
    const totalCount = pool.totalCount
    const idleCount = pool.idleCount
    const waitingCount = pool.waitingCount
    
    console.log(
        `[DB Pool] Новое соединение установлено ` +
        `(total: ${totalCount}, idle: ${idleCount}, waiting: ${waitingCount})`
    )
})

pool.on('acquire', (client) => {
    // Соединение взято из пула для запроса
    // Логируем только в dev для отладки
    if (!IS_PRODUCTION) {
        console.log(
            `[DB Pool] Соединение взято ` +
            `(idle: ${pool.idleCount}, waiting: ${pool.waitingCount})`
        )
    }
})

pool.on('remove', (client) => {
    console.log('[DB Pool] Соединение удалено из пула')
})

pool.on('error', (err, client) => {
    // Критичная ошибка — соединение в пуле сломалось
    console.error('[DB Pool] ❌ КРИТИЧЕСКАЯ ОШИБКА idle клиента:', err)
    console.error('[DB Pool] Stack trace:', err.stack)
    
    // В продакшене — отправляем алерт (Sentry, email, etc)
    if (IS_PRODUCTION) {
        // TODO: интеграция с мониторингом
        // Sentry.captureException(err)
    }
    
    // PostgreSQL может временно упасть — пытаемся переподключиться
    // Pool сам создаст новое соединение при следующем запросе
})

// ─── Graceful shutdown ────────────────────────────────────────────────────────

/**
 * Корректное закрытие пула при завершении приложения
 */
export async function closePool(): Promise<void> {
    console.log('[DB Pool] Закрытие пула соединений...')
    
    try {
        await pool.end()
        console.log('[DB Pool] ✅ Пул закрыт')
    } catch (error) {
        console.error('[DB Pool] ❌ Ошибка при закрытии пула:', error)
        throw error
    }
}

// Автоматическое закрытие при SIGTERM/SIGINT
// (вызывается из server.ts в shutdown функции)

// ─── Проверка подключения ────────────────────────────────────────────────────

/**
 * Проверка подключения к БД при старте сервера
 */
export async function checkDatabaseConnection(): Promise<boolean> {
    try {
        const client = await pool.connect()
        
        // Дополнительно проверяем что БД отвечает
        await client.query('SELECT NOW()')
        
        client.release()
        
        console.log('[DB] ✅ PostgreSQL подключен успешно')
        return true
    } catch (error) {
        console.error('[DB] ❌ Ошибка подключения к PostgreSQL:', error)
        
        // Логируем детали для диагностики
        if (error instanceof Error) {
            console.error('[DB] Сообщение:', error.message)
            
            // Частые ошибки:
            if (error.message.includes('ECONNREFUSED')) {
                console.error('[DB] PostgreSQL не запущен или недоступен')
            }
            if (error.message.includes('password authentication failed')) {
                console.error('[DB] Неверный пароль в DATABASE_URL')
            }
            if (error.message.includes('database') && error.message.includes('does not exist')) {
                console.error('[DB] База данных не существует')
            }
            if (error.message.includes('SSL')) {
                console.error('[DB] Проблема с SSL — проверь настройки ssl в pool')
            }
        }
        
        return false
    }
}

// ─── Query обёртка (опциональная) ─────────────────────────────────────────────

/**
 * Обёртка для запросов с логированием медленных запросов
 * 
 * РЕКОМЕНДАЦИЯ: лучше использовать pool.query() напрямую в репозиториях
 * Эта функция оставлена для обратной совместимости
 */
export async function query<T extends QueryResultRow = QueryResultRow>(
    text: string,
    params?: (string | number | boolean | null | string[] | Record<string, unknown>)[]
): Promise<QueryResult<T>> {
    const start = Date.now()
    
    try {
        const result = await pool.query<T>(text, params)
        const duration = Date.now() - start
        
        // Логируем медленные запросы
        // В продакшене порог выше (500ms)
        // В dev — ниже (100ms) для раннего обнаружения проблем
        const slowQueryThreshold = IS_PRODUCTION ? 500 : 100
        
        if (duration > slowQueryThreshold) {
            console.warn(
                `[SLOW QUERY] ${duration}ms | ` +
                `Rows: ${result.rowCount} | ` +
                `Query: ${text.slice(0, 100)}...`
            )
            
            // В dev показываем параметры (в prod могут быть sensitive данные)
            if (!IS_PRODUCTION && params) {
                console.warn(`[SLOW QUERY] Params:`, params)
            }
        }
        
        // Метрики (для будущей интеграции с Prometheus/Grafana)
        incrementQueryCount()
        recordQueryDuration(duration)
        
        return result
    } catch (error) {
        const duration = Date.now() - start
        
        console.error(
            `[QUERY ERROR] ${duration}ms | ` +
            `Query: ${text.slice(0, 100)}...`
        )
        
        if (!IS_PRODUCTION && params) {
            console.error(`[QUERY ERROR] Params:`, params)
        }
        
        console.error('[QUERY ERROR] Error:', error)
        
        throw error
    }
}

// ─── Транзакции ───────────────────────────────────────────────────────────────

/**
 * Выполнение транзакции с автоматическим ROLLBACK при ошибке
 * 
 * @example
 * await withTransaction(async (client) => {
 *   await client.query('UPDATE rooms SET status = $1', ['playing'])
 *   await client.query('UPDATE players SET ready = false')
 *   return { success: true }
 * })
 */
export async function withTransaction<T>(
    callback: (client: PoolClient) => Promise<T>
): Promise<T> {
    const client = await pool.connect()
    
    try {
        await client.query('BEGIN')
        
        const result = await callback(client)
        
        await client.query('COMMIT')
        
        return result
    } catch (error) {
        await client.query('ROLLBACK')
        
        console.error('[Transaction] ROLLBACK выполнен из-за ошибки:', error)
        
        throw error
    } finally {
        // ВСЕГДА возвращаем клиента в пул
        client.release()
    }
}

/**
 * Nested транзакции через SAVEPOINT
 * Полезно когда нужна частичная отмена внутри большой транзакции
 */
export async function withSavepoint<T>(
    client: PoolClient,
    savepointName: string,
    callback: (client: PoolClient) => Promise<T>
): Promise<T> {
    await client.query(`SAVEPOINT ${savepointName}`)
    
    try {
        const result = await callback(client)
        await client.query(`RELEASE SAVEPOINT ${savepointName}`)
        return result
    } catch (error) {
        await client.query(`ROLLBACK TO SAVEPOINT ${savepointName}`)
        throw error
    }
}

// ─── Метрики (базовая реализация) ─────────────────────────────────────────────

let queryCount = 0
let totalQueryDuration = 0
const queryDurations: number[] = []
const MAX_DURATION_SAMPLES = 1000

function incrementQueryCount(): void {
    queryCount++
}

function recordQueryDuration(duration: number): void {
    totalQueryDuration += duration
    queryDurations.push(duration)
    
    // Ограничиваем размер массива для расчёта перцентилей
    if (queryDurations.length > MAX_DURATION_SAMPLES) {
        queryDurations.shift()
    }
}

/**
 * Получить статистику пула и запросов
 */
export function getPoolStats() {
    const sorted = [...queryDurations].sort((a, b) => a - b)
    const p50 = sorted[Math.floor(sorted.length * 0.5)] ?? 0
    const p95 = sorted[Math.floor(sorted.length * 0.95)] ?? 0
    const p99 = sorted[Math.floor(sorted.length * 0.99)] ?? 0
    
    return {
        // Статистика пула
        pool: {
            total: pool.totalCount,      // всего соединений
            idle: pool.idleCount,        // простаивающих
            waiting: pool.waitingCount,  // ожидающих в очереди
        },
        
        // Статистика запросов
        queries: {
            total: queryCount,
            avgDuration: queryCount > 0 
                ? Math.round(totalQueryDuration / queryCount) 
                : 0,
            p50,  // медиана
            p95,  // 95-й перцентиль
            p99,  // 99-й перцентиль
        },
    }
}

/**
 * Сброс метрик (для тестов или периодической очистки)
 */
export function resetMetrics(): void {
    queryCount = 0
    totalQueryDuration = 0
    queryDurations.length = 0
}

// ─── Health check для мониторинга ─────────────────────────────────────────────

/**
 * Полная проверка здоровья БД для healthcheck эндпоинта
 */
export async function healthCheck(): Promise<{
    healthy: boolean
    latency: number
    poolStats: ReturnType<typeof getPoolStats>
    error?: string
}> {
    const start = Date.now()
    
    try {
        const client = await pool.connect()
        await client.query('SELECT 1')
        client.release()
        
        const latency = Date.now() - start
        
        return {
            healthy: true,
            latency,
            poolStats: getPoolStats(),
        }
    } catch (error) {
        return {
            healthy: false,
            latency: Date.now() - start,
            poolStats: getPoolStats(),
            error: error instanceof Error ? error.message : String(error),
        }
    }
}

// ─── Экспорт типов ────────────────────────────────────────────────────────────

export type { PoolClient, QueryResult, QueryResultRow } from 'pg'