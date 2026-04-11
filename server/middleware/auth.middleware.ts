// server/middleware/auth.middleware.ts

import { Request, Response, NextFunction } from 'express'
import { createClient, SupabaseClient, User } from '@supabase/supabase-js'
import jwt from 'jsonwebtoken'
import { usersRepository } from '../database/repositories/users.repository'
import type { UserRow, UpsertUserByGoogleData } from '../database/types'

// ─── Валидация переменных окружения ───────────────────────────────────────────

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY
const SUPABASE_JWT_SECRET = process.env.SUPABASE_JWT_SECRET

if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_JWT_SECRET) {
    console.error('[Auth] ❌ Отсутствуют обязательные переменные окружения:')
    if (!SUPABASE_URL) console.error('  - SUPABASE_URL')
    if (!SUPABASE_ANON_KEY) console.error('  - SUPABASE_ANON_KEY')
    if (!SUPABASE_JWT_SECRET) console.error('  - SUPABASE_JWT_SECRET')
    
    if (process.env.NODE_ENV === 'production') {
        process.exit(1)
    }
}

// ─── Supabase клиент ──────────────────────────────────────────────────────────

const supabase: SupabaseClient = createClient(SUPABASE_URL!, SUPABASE_ANON_KEY!)

// ─── Кеши ─────────────────────────────────────────────────────────────────────

/**
 * Кеш проверенных токенов 
 * Структура: Map<token, { userId: string, expiresAt: number }>
 */
const tokenCache = new Map<string, { 
    userId: string
    expiresAt: number 
}>()

/**
 * Кеш последних upsert операций по userId
 * Предотвращает частые обновления last_seen_at
 */
const lastUpsertCache = new Map<string, number>()

// Очистка кеша каждые 10 минут
setInterval(() => {
    const now = Date.now()
    
    // Удаляем истёкшие токены
    tokenCache.forEach((value, key) => {
        if (now > value.expiresAt) {
            tokenCache.delete(key)
        }
    })
    
    // Очищаем старые записи upsert (старше 30 минут)
    lastUpsertCache.forEach((timestamp, userId) => {
        if (now - timestamp > 30 * 60 * 1000) {
            lastUpsertCache.delete(userId)
        }
    })
}, 10 * 60 * 1000)

// ─── Утилиты ──────────────────────────────────────────────────────────────────

/**
 * Локальная верификация Supabase JWT без запроса к API
 */
function verifySupabaseJWT(token: string): { userId: string; email: string; exp: number } | null {
    try {
        const decoded = jwt.verify(token, SUPABASE_JWT_SECRET!, {
            algorithms: ['HS256'],
            audience: 'authenticated',
        }) as jwt.JwtPayload

        if (!decoded.sub || !decoded.email || !decoded.exp) {
            return null
        }

        return {
            userId: decoded.sub,
            email: decoded.email as string,
            exp: decoded.exp * 1000, // convert to milliseconds
        }
    } catch (error) {
        // JWT невалидный, истёкший, или неправильный секрет
        return null
    }
}

/**
 * Получение полной информации пользователя от Supabase
 * Вызывается только при первой проверке токена
 */
async function getSupabaseUser(token: string): Promise<User | null> {
    try {
        const { data: { user }, error } = await supabase.auth.getUser(token)
        
        if (error || !user) {
            console.warn('[Auth] Supabase getUser failed:', error?.message)
            return null
        }

        return user
    } catch (error) {
        console.error('[Auth] Supabase API недоступен:', error)
        return null
    }
}

/**
 * Извлечение display_name из Supabase user metadata
 */
function extractDisplayName(user: User): string | null {
    // Приоритеты:
    // 1. full_name из user_metadata (Google OAuth)
    // 2. name из user_metadata
    // 3. display_name из user_metadata  
    // 4. первая часть email
    // 5. null (пользователь сам заполнит)

    const metadata = user.user_metadata || {}
    
    if (metadata.full_name && typeof metadata.full_name === 'string') {
        return metadata.full_name.trim()
    }
    
    if (metadata.name && typeof metadata.name === 'string') {
        return metadata.name.trim()
    }
    
    if (metadata.display_name && typeof metadata.display_name === 'string') {
        return metadata.display_name.trim()
    }
    
    if (user.email) {
        const emailPrefix = user.email.split('@')[0]
        if (emailPrefix && emailPrefix.length > 0) {
            return emailPrefix
        }
    }
    
    return null
}

/**
 * Проверка нужно ли делать upsert пользователя
 * Избегаем частых обновлений last_seen_at
 */
function shouldUpsertUser(userId: string): boolean {
    const lastUpsert = lastUpsertCache.get(userId)
    if (!lastUpsert) {
        return true // первый раз
    }
    
    // Обновляем не чаще раза в 5 минут
    const UPSERT_INTERVAL = 5 * 60 * 1000
    return Date.now() - lastUpsert > UPSERT_INTERVAL
}

// ─── Middleware ───────────────────────────────────────────────────────────────

/**
 * Middleware авторизации через Supabase JWT
 */
export async function authMiddleware(
    req: Request,
    res: Response,
    next: NextFunction
): Promise<void> {
    
    // ─── 1. Извлечение токена ─────────────────────────────────────────────────
    
    const authHeader = req.headers.authorization
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        res.status(401).json({ 
            error: 'Отсутствует токен авторизации',
            code: 'MISSING_TOKEN'
        })
        return
    }

    const token = authHeader.slice(7) // убираем "Bearer "
    
    if (!token || token.length === 0) {
        res.status(401).json({ 
            error: 'Пустой токен авторизации',
            code: 'EMPTY_TOKEN'
        })
        return
    }

    try {
        // ─── 2. Проверка кеша ─────────────────────────────────────────────────
        
        const cached = tokenCache.get(token)
        if (cached && Date.now() < cached.expiresAt) {
            // Токен уже проверен и ещё действителен
            const user = await usersRepository.findById(cached.userId)
            
            if (user) {
                req.user = user
                
                // Опционально обновляем last_seen_at
                if (shouldUpsertUser(user.id)) {
                    usersRepository.updateLastSeen(user.id).catch(err => {
                        console.error('[Auth] updateLastSeen failed:', err)
                    })
                    lastUpsertCache.set(user.id, Date.now())
                }
                
                next()
                return
            } else {
                // Пользователь был удалён из БД — удаляем из кеша
                tokenCache.delete(token)
            }
        }

        // ─── 3. Локальная верификация JWT ────────────────────────────────────
        
        const jwtPayload = verifySupabaseJWT(token)
        
        if (!jwtPayload) {
            res.status(401).json({ 
                error: 'Невалидный или истёкший токен',
                code: 'INVALID_TOKEN'
            })
            return
        }

        // Токен валидный — кешируем на будущее
        tokenCache.set(token, {
            userId: jwtPayload.userId,
            expiresAt: jwtPayload.exp - 60000, // кешируем до истечения минус 1 минута
        })

        // ─── 4. Получение пользователя из БД ──────────────────────────────────
        
        let user = await usersRepository.findByGoogleId(jwtPayload.userId)
        
        if (!user || shouldUpsertUser(jwtPayload.userId)) {
            // Пользователя нет в БД или нужно обновить last_seen_at
            // Получаем полную информацию от Supabase
            const supabaseUser = await getSupabaseUser(token)
            
            if (!supabaseUser) {
                res.status(401).json({ 
                    error: 'Не удалось получить информацию о пользователе',
                    code: 'USER_FETCH_FAILED'
                })
                return
            }

            // Подготавливаем данные для upsert
            const upsertData: UpsertUserByGoogleData = {
                googleId: supabaseUser.id,
                email: supabaseUser.email || jwtPayload.email,
                displayName: extractDisplayName(supabaseUser),
                avatarUrl: supabaseUser.user_metadata?.avatar_url || null,
            }

            // Валидация email
            if (!upsertData.email) {
                console.error('[Auth] Пользователь без email:', supabaseUser.id)
                res.status(401).json({ 
                    error: 'Отсутствует email пользователя',
                    code: 'MISSING_EMAIL'
                })
                return
            }

            try {
                user = await usersRepository.upsertByGoogleId(upsertData)
                lastUpsertCache.set(jwtPayload.userId, Date.now())
            } catch (error) {
                console.error('[Auth] Ошибка upsert пользователя:', error)
                res.status(500).json({ 
                    error: 'Ошибка создания/обновления пользователя',
                    code: 'UPSERT_FAILED'
                })
                return
            }
        }

        // ─── 5. Финализация ───────────────────────────────────────────────────
        
        req.user = user
        next()

    } catch (error) {
        console.error('[Auth] Неожиданная ошибка middleware:', error)
        
        // Удаляем потенциально сломанный токен из кеша
        tokenCache.delete(token)
        
        res.status(500).json({ 
            error: 'Внутренняя ошибка авторизации',
            code: 'INTERNAL_ERROR'
        })
    }
}

/**
 * Опциональный middleware — проверяет авторизацию но не падает если её нет
 * Полезно для эндпоинтов которые работают и для анонимных пользователей
 */
export async function optionalAuthMiddleware(
    req: Request,
    res: Response,
    next: NextFunction
): Promise<void> {
    
    const authHeader = req.headers.authorization
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        // Нет токена — продолжаем без авторизации
        next()
        return
    }

    // Есть токен — пытаемся авторизоваться
    // Но если ошибка — не падаем, а продолжаем без req.user
    
    const originalSend = res.json
    let responseSent = false
    
    // Перехватываем ответ от authMiddleware
    res.json = function(this: Response, body: any) {
        responseSent = true
        if (body?.error) {
            // authMiddleware вернул ошибку — игнорируем, продолжаем без авторизации
            req.user = undefined as any // очищаем req.user
            res.json = originalSend // восстанавливаем
            next()
            return this
        } else {
            // Успешно — возвращаем как есть
            return originalSend.call(this, body)
        }
    }

    // Вызываем обычный authMiddleware
    authMiddleware(req, res, () => {
        if (!responseSent) {
            res.json = originalSend // восстанавливаем
            next()
        }
    })
}

/**
 * Получить статистику кеша (для мониторинга)
 */
export function getAuthCacheStats() {
    return {
        tokenCache: {
            size: tokenCache.size,
            entries: Array.from(tokenCache.entries()).map(([token, value]) => ({
                tokenPrefix: token.slice(0, 10) + '...',
                userId: value.userId,
                expiresAt: new Date(value.expiresAt).toISOString(),
            })),
        },
        lastUpsertCache: {
            size: lastUpsertCache.size,
        },
    }
}

/**
 * Очистка кеша (для тестов или принудительной перезагрузки)
 */
export function clearAuthCache(): void {
    tokenCache.clear()
    lastUpsertCache.clear()
    console.log('[Auth] Кеш очищен')
}

/**
 * Принудительная инвалидация токена (при logout)
 */
export function invalidateToken(token: string): void {
    tokenCache.delete(token)
}