// server/routes/api.routes.ts

import { Router, Request, Response } from 'express'
import { pool } from '../database/pool'
import { authMiddleware } from '../middleware/auth.middleware'
import { sseService } from '../services/sse.service'
import { messagesRepository } from '../database/repositories/messages.repository'
import { roomsRepository } from '../database/repositories/rooms.repository'
import { playersRepository } from '../database/repositories/players.repository'
import { bestiaryRepository } from '../database/repositories/bestiary.repository'
import { healthCheck } from '../database/pool'
import { GoogleGenAI, Type, HarmCategory, HarmBlockThreshold } from '@google/genai'
import { z } from 'zod'
import rateLimit from 'express-rate-limit'
import type {
    RoomRow,
    RoomPlayerRow,
    MessageRow,
} from '../database/types'

export const apiRouter = Router()

// ─── Логирование запросов ─────────────────────────────────────────────────────

// Логируем только в dev режиме
if (process.env.NODE_ENV !== 'production') {
    apiRouter.use((req, _res, next) => {
        console.log(`[API] ${req.method} ${req.path}`)
        next()
    })
}

// ─── Rate Limiters ────────────────────────────────────────────────────────────

const aiLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 15,
    message: { error: 'Слишком много запросов к ИИ. Подождите минуту.' },
    skip: (_req) => process.env.NODE_ENV === 'test',
})

const reportLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 5,
    message: { error: 'Слишком много репортов. Подождите минуту.' },
})

// ─── Zod схемы валидации ──────────────────────────────────────────────────────

const createRoomSchema = z.object({
    scenario: z.string().max(2000).optional(),
})

const joinRoomSchema = z.object({
    joinCode: z.string().min(6).max(10),
    characterName: z.string().min(1).max(100),
    characterProfile: z.string().max(5000).optional().default(''),
    stats: z.object({
        strength: z.number().int().min(1).max(20).optional().default(10),
        speed: z.number().int().min(1).max(20).optional().default(10),
        durability: z.number().int().min(1).max(20).optional().default(10),
        reaction: z.number().int().min(1).max(20).optional().default(10),
        power: z.number().int().min(1).max(20).optional().default(10),
        stamina: z.number().int().min(1).max(20).optional().default(10),
    }).optional().default({}),
    inventory: z.array(z.string()).max(50).optional().default([]),
    skills: z.array(z.string()).max(50).optional().default([]),
    alignment: z.string().max(50).optional().default('true_neutral'),
})

const playerActionSchema = z.object({
    action: z.string().min(1).max(2000),
    isHidden: z.boolean().optional().default(false),
})

const playerUpdateSchema = z.object({
    hp: z.number().int().min(0).max(9999).optional(),
    mana: z.number().int().min(0).max(9999).optional(),
    stress: z.number().int().min(0).max(9999).optional(),
    is_ready: z.boolean().optional(),
    current_action: z.string().max(2000).nullable().optional(),
    character_profile: z.string().max(5000).optional(),
})

const sendMessageSchema = z.object({
    content: z.string().min(1).max(10000),
    type: z.enum(['player_action', 'ai_response', 'dice_roll', 'system', 'secret']).default('player_action'),
    turn_number: z.number().int().min(0).optional().default(0),
    metadata: z.record(z.unknown()).optional().default({}),
})

const reportSchema = z.object({
    type: z.string().min(1).max(50),
    message: z.string().min(1).max(2000),
    userEmail: z.string().email().optional(),
    roomId: z.string().optional(),
    turn: z.number().int().min(0).optional(),
    version: z.string().max(20).optional(),
})

const geminiGenerateSchema = z.object({
    roomId: z.string().uuid(),
    playersContext: z.array(z.unknown()).optional().default([]),
    recentMessages: z.string().max(50000).optional().default(''),
    turn: z.number().int().min(0).optional().default(0),
    actionsText: z.string().max(10000).optional().default(''),
    currentQuests: z.array(z.unknown()).optional().default([]),
    worldState: z.string().max(10000).optional().default(''),
    factions: z.record(z.unknown()).optional().default({}),
    hiddenTimers: z.record(z.number()).optional().default({}),
    gmTone: z.string().max(100).optional().default('neutral'),
    difficulty: z.string().max(50).optional().default('normal'),
    goreLevel: z.string().max(50).optional().default('moderate'),
    language: z.string().max(20).optional().default('russian'),
})

const geminiJoinSchema = z.object({
    characterName: z.string().min(1).max(100),
    characterProfile: z.string().max(5000),
    roomId: z.string().uuid().optional(),
})

const geminiSummarizeSchema = z.object({
    currentSummary: z.string().max(10000).optional().default(''),
    recentMessages: z.string().max(50000),
    roomId: z.string().uuid(),
})

const geminiArchivistSchema = z.object({
    candidates: z.array(z.object({
        name: z.string().min(1).max(200),
        rawFacts: z.string().max(5000),
        reason: z.string().max(1000),
    })).max(20),
    roomId: z.string().uuid(),
})

// Схема ответа Gemini для генерации хода
const gameResponseSchema = z.object({
    reasoning: z.string(),
    story: z.string(),
    worldUpdates: z.string(),
    factionUpdates: z.record(z.string(), z.string()),
    hiddenTimersUpdates: z.record(z.string(), z.number()),
    stateUpdates: z.array(z.object({
        uid: z.string(),
        hp: z.number(),
        mana: z.number(),
        stress: z.number(),
        alignment: z.string(),
        inventory: z.array(z.string()),
        skills: z.array(z.string()),
        injuries: z.array(z.string()),
        statuses: z.array(z.string()),
        mutations: z.array(z.string()),
        reputation: z.record(z.string(), z.number()),
        stats: z.object({
            speed: z.number(),
            reaction: z.number(),
            strength: z.number(),
            power: z.number(),
            durability: z.number(),
            stamina: z.number(),
        })
    })),
    wikiCandidates: z.array(z.object({
        name: z.string(),
        rawFacts: z.string(),
        reason: z.string(),
    })),
    active_quests: z.array(z.unknown()).optional().default([]),
})

// ─── AI конфигурация ──────────────────────────────────────────────────────────

const safetySettings = [
    { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
    { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
    { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
    { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
    { category: HarmCategory.HARM_CATEGORY_CIVIC_INTEGRITY, threshold: HarmBlockThreshold.BLOCK_NONE },
]

// Кеш AI клиентов по API ключу
const aiClientCache = new Map<string, GoogleGenAI>()

function getAIKeys(): string[] {
    const primaryKey = process.env.GEMINI_API_KEY || process.env.API_KEY
    const additionalKeys = process.env.GEMINI_API_KEYS
        ? process.env.GEMINI_API_KEYS.split(',').map(k => k.trim()).filter(k => k)
        : []
    const allKeys = primaryKey ? [primaryKey, ...additionalKeys] : additionalKeys
    return Array.from(new Set(allKeys))
}

function getAIClient(apiKey: string): GoogleGenAI {
    if (!aiClientCache.has(apiKey)) {
        aiClientCache.set(apiKey, new GoogleGenAI({ apiKey }))
    }
    return aiClientCache.get(apiKey)!
}

/**
 * Генерация с fallback по API ключам и моделям
 */
async function generateWithFallback(
    prompt: string,
    baseConfig: Record<string, unknown>,
    models: string[] = ['gemini-2.0-flash', 'gemini-2.0-flash-lite']
): Promise<string> {
    const keys = getAIKeys()
    
    if (keys.length === 0) {
        throw new Error('GEMINI_API_KEY не задан. Добавь в переменные окружения.')
    }

    const modelList = baseConfig.model
        ? [baseConfig.model as string, ...models.filter(m => m !== baseConfig.model)]
        : models

    let lastError: Error = new Error('Неизвестная ошибка')

    for (const key of keys) {
        const ai = getAIClient(key)

        for (const modelName of modelList) {
            try {
                const config = { ...baseConfig }
                delete config.model

                // gemini-2.0-flash-lite не поддерживает thinkingConfig
                if (modelName.includes('lite') && config.thinkingConfig) {
                    delete config.thinkingConfig
                }

                const response = await ai.models.generateContent({
                    model: modelName,
                    contents: prompt,
                    config: {
                        ...config,
                        safetySettings,
                    },
                })

                const text = response.text
                if (!text) {
                    throw new Error('AI вернул пустой ответ')
                }

                return text

            } catch (error) {
                lastError = error as Error

                const msg = lastError.message || ''

                // Rate limit — пробуем следующий ключ
                if (msg.includes('429')) {
                    console.warn(`[AI] Rate limit на ключе ...${key.slice(-6)}, пробуем следующий`)
                    break
                }

                // Невалидный ключ — пробуем следующий
                if (msg.includes('API key not valid') || msg.includes('403')) {
                    console.error(`[AI] Невалидный API ключ ...${key.slice(-6)}`)
                    break
                }

                // Модель недоступна — пробуем следующую
                if (msg.includes('404') || msg.includes('not found')) {
                    console.warn(`[AI] Модель ${modelName} недоступна, пробуем следующую`)
                    continue
                }

                console.error(`[AI] Ошибка ${modelName}:`, msg)
            }
        }
    }

    throw lastError
}

/**
 * Парсинг JSON из ответа AI с очисткой markdown обёрток
 */
function parseAIJson(text: string): unknown {
    let cleaned = text.trim()

    // Убираем ```json ... ``` или ``` ... ```
    const match = cleaned.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)
    if (match) {
        cleaned = match[1].trim()
    }

    // Если есть текст до {  — берём только JSON часть
    const jsonStart = cleaned.indexOf('{')
    const jsonEnd = cleaned.lastIndexOf('}')

    if (jsonStart !== -1 && jsonEnd !== -1) {
        cleaned = cleaned.slice(jsonStart, jsonEnd + 1)
    }

    return JSON.parse(cleaned)
}

/**
 * Генерация с валидацией через Zod
 * Итеративный подход вместо рекурсии
 */
async function generateWithValidation(
    prompt: string,
    baseConfig: Record<string, unknown>
): Promise<z.infer<typeof gameResponseSchema>> {
    const MAX_ATTEMPTS = 3
    let lastError: Error = new Error('Неизвестная ошибка')
    let currentPrompt = prompt

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        try {
            const rawResponse = await generateWithFallback(currentPrompt, baseConfig)
            const parsed = parseAIJson(rawResponse)
            return gameResponseSchema.parse(parsed)
        } catch (error) {
            lastError = error as Error
            console.warn(`[AI] Попытка ${attempt}/${MAX_ATTEMPTS} провалилась:`, lastError.message)

            if (attempt < MAX_ATTEMPTS) {
                // Добавляем описание ошибки в промпт для следующей попытки
                currentPrompt = (
                    `${prompt}\n\n` +
                    `ПРЕДЫДУЩИЙ ОТВЕТ БЫЛ НЕВАЛИДНЫМ.\n` +
                    `ОШИБКА: ${lastError.message}\n` +
                    `ИСПРАВЬ ОШИБКУ И ВЕРНИ ВАЛИДНЫЙ JSON.`
                )
            }
        }
    }

    throw new Error(`AI не смог сгенерировать валидный ответ за ${MAX_ATTEMPTS} попытки: ${lastError.message}`)
}

// ─── Утилиты ──────────────────────────────────────────────────────────────────

/**
 * Поиск комнаты по ID или join_code
 * ОПТИМИЗАЦИЯ: один SQL запрос вместо двух
 */
async function resolveRoom(identifier: string): Promise<RoomRow | null> {
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(identifier)

    const sql = isUUID
        ? `SELECT * FROM rooms WHERE id = $1 OR join_code = $1 LIMIT 1`
        : `SELECT * FROM rooms WHERE join_code = $1 LIMIT 1`

    const result = await pool.query<RoomRow>(sql, [identifier.toUpperCase()])
    return result.rows[0] ?? null
}

/**
 * Экранирование HTML для Telegram сообщений
 */
function escapeHtml(unsafe: string): string {
    return unsafe.replace(/[&<>"']/g, (m) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;',
    }[m]!))
}

// ─── Health checks ────────────────────────────────────────────────────────────

apiRouter.get('/health/db', async (_req, res) => {
    try {
        const health = await healthCheck()

        res.status(health.healthy ? 200 : 503).json({
            ok: health.healthy,
            latency: health.latency,
            pool: health.poolStats.pool,
        })
    } catch (error) {
        console.error('[Health] DB check failed:', error)
        res.status(503).json({ ok: false, error: 'Database unavailable' })
    }
})

apiRouter.get('/health/auth', authMiddleware, (req, res) => {
    // Возвращаем публичный профиль, не полную строку из БД
    const { id, display_name, avatar_url } = req.user
    res.json({
        ok: true,
        user: { id, display_name, avatar_url },
    })
})

// ─── Reporting ────────────────────────────────────────────────────────────────

apiRouter.post('/report', reportLimiter, authMiddleware, async (req, res) => {
    const validation = reportSchema.safeParse(req.body)

    if (!validation.success) {
        res.status(400).json({ error: 'Некорректные данные репорта' })
        return
    }

    const { type, message, userEmail, roomId, turn, version } = validation.data

    const botToken = process.env.TELEGRAM_BOT_TOKEN
    const chatId = process.env.TELEGRAM_CHAT_ID

    if (!botToken || !chatId) {
        res.status(503).json({ error: 'Служба репортов недоступна' })
        return
    }

    // Используем email из токена авторизации, не из тела запроса
    const authenticatedEmail = req.user.email

    const text = [
        `<b>🚀 Новый репорт: ${escapeHtml(type.toUpperCase())}</b>`,
        `<b>От:</b> ${escapeHtml(authenticatedEmail || userEmail || 'Аноним')}`,
        `<b>Комната:</b> ${roomId ? escapeHtml(roomId) : 'N/A'}`,
        `<b>Ход:</b> ${turn ?? 0}`,
        `<b>Версия:</b> ${escapeHtml(version || '1.0.0')}`,
        '',
        `<b>Сообщение:</b>`,
        `<i>${escapeHtml(message)}</i>`,
    ].join('\n')

    try {
        const response = await fetch(
            `https://api.telegram.org/bot${botToken}/sendMessage`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    chat_id: chatId,
                    text,
                    parse_mode: 'HTML',
                }),
            }
        )

        if (!response.ok) {
            throw new Error(`Telegram API ответил: ${response.status}`)
        }

        res.json({ success: true })
    } catch (error) {
        console.error('[Report] Ошибка отправки в Telegram:', error)
        res.status(500).json({ error: 'Не удалось отправить репорт' })
    }
})

// ─── Rooms API ────────────────────────────────────────────────────────────────

apiRouter.post('/rooms', authMiddleware, async (req, res) => {
    const validation = createRoomSchema.safeParse(req.body)

    if (!validation.success) {
        res.status(400).json({ error: 'Некорректные данные' })
        return
    }

    try {
        const room = await roomsRepository.createRoom({
            host_user_id: req.user.id,
            world_settings: { scenario: validation.data.scenario } as any,
        })

        res.status(201).json(room)
    } catch (error) {
        console.error('[API] POST /rooms:', error)
        res.status(500).json({ error: 'Не удалось создать комнату' })
    }
})

apiRouter.get('/rooms', authMiddleware, async (req, res) => {
    try {
        const userId = req.user.id

        // Используем репозиторий вместо прямого SQL
        const sql = `
            SELECT DISTINCT r.*
            FROM rooms r
            LEFT JOIN room_players rp ON rp.room_id = r.id
            WHERE r.host_user_id = $1 OR rp.user_id = $1
            ORDER BY r.created_at DESC
            LIMIT 20
        `

        const result = await pool.query<RoomRow>(sql, [userId])
        res.json(result.rows)
    } catch (error) {
        console.error('[API] GET /rooms:', error)
        res.status(500).json({ error: 'Не удалось получить список комнат' })
    }
})

apiRouter.get('/rooms/:roomId', authMiddleware, async (req, res) => {
    try {
        const room = await resolveRoom(req.params.roomId)

        if (!room) {
            res.status(404).json({ error: 'Комната не найдена' })
            return
        }

        res.json(room)
    } catch (error) {
        console.error('[API] GET /rooms/:roomId:', error)
        res.status(500).json({ error: 'Не удалось получить комнату' })
    }
})

apiRouter.post('/rooms/:roomId/start', authMiddleware, async (req, res) => {
    try {
        const room = await resolveRoom(req.params.roomId)

        if (!room) {
            res.status(404).json({ error: 'Комната не найдена' })
            return
        }

        if (room.host_user_id !== req.user.id) {
            res.status(403).json({ error: 'Только хост может начать игру' })
            return
        }

        if (room.status !== 'lobby') {
            res.status(400).json({ error: 'Игра уже начата или завершена' })
            return
        }

        const updatedRoom = await roomsRepository.updateStatus(room.id, 'playing')
        await roomsRepository.updateTurn(room.id, 1, 'waiting', '')

        sseService.broadcast(room.id, 'room.updated', {
            status: 'playing',
            turn_number: 1,
            turn_status: 'waiting',
        })

        res.json({ success: true, room: updatedRoom })
    } catch (error) {
        console.error('[API] POST /rooms/:roomId/start:', error)
        res.status(500).json({ error: 'Не удалось начать игру' })
    }
})

// ВАЖНО: /rooms/join должен быть ДО /rooms/:roomId
// иначе Express подставит 'join' как roomId
apiRouter.post('/rooms/join', authMiddleware, async (req, res) => {
    const validation = joinRoomSchema.safeParse(req.body)

    if (!validation.success) {
        res.status(400).json({
            error: 'Некорректные данные',
            details: validation.error.flatten(),
        })
        return
    }

    const { joinCode, characterName, characterProfile, stats, inventory, skills, alignment } = validation.data

    try {
        const room = await resolveRoom(joinCode)

        if (!room) {
            res.status(404).json({ error: 'Комната не найдена или неверный код' })
            return
        }

        if (room.status === 'finished') {
            res.status(400).json({ error: 'Игра уже завершена' })
            return
        }

        // Проверяем существующего игрока
        const existingPlayer = await playersRepository.findByRoomAndUser(room.id, req.user.id)

        if (existingPlayer) {
            // Обновляем статус онлайн
            await playersRepository.updateState(existingPlayer.id, { is_online: true })
            res.json({ room, player: existingPlayer })
            return
        }

        // Создаём нового игрока
        const player = await playersRepository.create({
            room_id: room.id,
            user_id: req.user.id,
            character_name: characterName,
            character_profile: characterProfile,
            hp: 100,
            hp_max: 100,
            mana: 50,
            mana_max: 50,
            stress: 0,
            stress_max: 100,
            stat_strength: stats.strength,
            stat_dexterity: stats.speed,
            stat_constitution: stats.durability,
            stat_intelligence: stats.reaction,
            stat_wisdom: stats.power,
            stat_charisma: stats.stamina,
            inventory: inventory as any,
            skills: skills as any,
            statuses: {} as any,
            injuries: {} as any,
            alignment: alignment,
            mutations: {} as any,
            reputation: {} as any,
            current_action: null,
            is_ready: false,
            is_online: true,
            last_active_at: new Date(),
        })

        sseService.broadcast(room.id, 'player.joined', { player })
        res.json({ room, player })
    } catch (error) {
        console.error('[API] POST /rooms/join:', error)
        res.status(500).json({ error: 'Не удалось присоединиться к комнате' })
    }
})

// ─── Players API ──────────────────────────────────────────────────────────────

apiRouter.get('/rooms/:roomId/players', authMiddleware, async (req, res) => {
    try {
        const room = await resolveRoom(req.params.roomId)

        if (!room) {
            res.status(404).json({ error: 'Комната не найдена' })
            return
        }

        const players = await playersRepository.findByRoom(room.id)
        res.json(players)
    } catch (error) {
        console.error('[API] GET /rooms/:roomId/players:', error)
        res.status(500).json({ error: 'Не удалось получить игроков' })
    }
})

apiRouter.post('/rooms/:roomId/players/action', authMiddleware, async (req, res) => {
    const validation = playerActionSchema.safeParse(req.body)

    if (!validation.success) {
        res.status(400).json({
            error: 'Некорректные данные',
            details: validation.error.flatten(),
        })
        return
    }

    const { action, isHidden } = validation.data

    try {
        const room = await resolveRoom(req.params.roomId)

        if (!room) {
            res.status(404).json({ error: 'Комната не найдена' })
            return
        }

        if (room.status !== 'playing') {
            res.status(400).json({ error: 'Игра не активна' })
            return
        }

        const player = await playersRepository.findByRoomAndUser(room.id, req.user.id)

        if (!player) {
            res.status(404).json({ error: 'Вы не являетесь игроком в этой комнате' })
            return
        }

        const updatedPlayer = await playersRepository.updateAction(player.id, action, true)

        // Скрытые действия не транслируются другим игрокам
        if (!isHidden) {
            sseService.broadcast(room.id, 'player.updated', updatedPlayer)
        } else {
            // Скрытое действие — только хосту (ГМ)
            sseService.sendToUser(room.host_user_id, 'player.updated', updatedPlayer)
        }

        res.json(updatedPlayer)
    } catch (error) {
        console.error('[API] POST /rooms/:roomId/players/action:', error)
        res.status(500).json({ error: 'Не удалось отправить действие' })
    }
})

apiRouter.post('/rooms/:roomId/players/update', authMiddleware, async (req, res) => {
    const validation = playerUpdateSchema.safeParse(req.body)

    if (!validation.success) {
        res.status(400).json({
            error: 'Некорректные данные',
            details: validation.error.flatten(),
        })
        return
    }

    try {
        const room = await resolveRoom(req.params.roomId)

        if (!room) {
            res.status(404).json({ error: 'Комната не найдена' })
            return
        }

        const player = await playersRepository.findByRoomAndUser(room.id, req.user.id)

        if (!player) {
            res.status(404).json({ error: 'Вы не являетесь игроком в этой комнате' })
            return
        }

        const updatedPlayer = await playersRepository.updateState(player.id, validation.data)

        sseService.broadcast(room.id, 'player.updated', updatedPlayer)
        res.json(updatedPlayer)
    } catch (error) {
        console.error('[API] POST /rooms/:roomId/players/update:', error)
        res.status(500).json({ error: 'Не удалось обновить игрока' })
    }
})

// ─── SSE Realtime ─────────────────────────────────────────────────────────────

apiRouter.get('/rooms/:roomId/events', authMiddleware, async (req, res) => {
    try {
        const room = await resolveRoom(req.params.roomId)

        if (!room) {
            res.status(404).json({ error: 'Комната не найдена' })
            return
        }

        const isHost = room.host_user_id === req.user.id
        const player = await playersRepository.findByRoomAndUser(room.id, req.user.id)

        if (!isHost && !player) {
            res.status(403).json({ error: 'Нет доступа к этой комнате' })
            return
        }

        // SSE заголовки
        res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache, no-transform',
            'Connection': 'keep-alive',
            'X-Accel-Buffering': 'no',
        })

        // Регистрируем клиента
        const clientId = sseService.addClient(room.id, req.user.id, res)

        // Отправляем снапшот текущего состояния комнаты
        const [players, messages] = await Promise.all([
            playersRepository.findByRoom(room.id),
            messagesRepository.getRecent(room.id, 50),
        ])

        sseService.sendToClient(clientId, 'room.snapshot', {
            room,
            players,
            messages,
            isGenerating: room.turn_status === 'generating',
        })

        // Помечаем игрока онлайн
        if (player) {
            await playersRepository.updateState(player.id, { is_online: true })
            sseService.broadcast(room.id, 'player.updated', {
                player_id: req.user.id,
                changes: { is_online: true },
            })
        }

        // Очистка при отключении
        req.on('close', async () => {
            sseService.removeClient(room.id, clientId)

            // Помечаем игрока оффлайн
            if (player) {
                try {
                    await playersRepository.updateState(player.id, { is_online: false })
                    sseService.broadcast(room.id, 'player.updated', {
                        player_id: req.user.id,
                        changes: { is_online: false },
                    })
                } catch (err) {
                    console.error('[SSE] Ошибка обновления статуса offline:', err)
                }
            }
        })

    } catch (error) {
        console.error('[API] GET /rooms/:roomId/events:', error)

        if (!res.headersSent) {
            res.status(500).json({ error: 'Не удалось подключиться к событиям комнаты' })
        }
    }
})

// ─── Bestiary API ─────────────────────────────────────────────────────────────

apiRouter.get('/bestiary', authMiddleware, async (req, res) => {
    try {
        const search = typeof req.query.search === 'string' ? req.query.search : ''
        const category = typeof req.query.category === 'string' ? req.query.category : undefined

        const entries = await bestiaryRepository.search(search, category)
        res.json(entries)
    } catch (error) {
        console.error('[API] GET /bestiary:', error)
        res.status(500).json({ error: 'Не удалось получить бестиарий' })
    }
})

// ─── Gemini AI Routes ─────────────────────────────────────────────────────────

apiRouter.post('/gemini/join', authMiddleware, aiLimiter, async (req, res) => {
    const validation = geminiJoinSchema.safeParse(req.body)

    if (!validation.success) {
        res.status(400).json({
            error: 'Некорректные данные',
            details: validation.error.flatten(),
        })
        return
    }

    const { characterName, characterProfile, roomId } = validation.data

    try {
        const prompt = [
            `Проанализируй анкету RPG персонажа и извлеки логичный стартовый инвентарь, список навыков/способностей и определи его мировоззрение (alignment).`,
            `Имя персонажа: ${characterName}`,
            `Анкета: ${characterProfile}`,
            ``,
            `Верни JSON объект с массивами "inventory" и "skills", а также строку "alignment".`,
            `Названия должны быть на РУССКОМ языке.`,
        ].join('\n')

        const text = await generateWithFallback(prompt, {
            responseMimeType: 'application/json',
            responseSchema: {
                type: Type.OBJECT,
                properties: {
                    inventory: { type: Type.ARRAY, items: { type: Type.STRING } },
                    skills: { type: Type.ARRAY, items: { type: Type.STRING } },
                    alignment: { type: Type.STRING },
                },
                required: ['inventory', 'skills', 'alignment'],
            },
        })

        const parsed = parseAIJson(text) as {
            inventory: string[]
            skills: string[]
            alignment: string
        }

        // Системное сообщение о входе в комнату
        if (roomId) {
            const room = await roomsRepository.findById(roomId)

            if (room) {
                const message = await messagesRepository.create({
                    room_id: roomId,
                    user_id: null,
                    type: 'system',
                    content: `Игрок **${characterName}** присоединился к игре.`,
                    turn_number: room.turn_number,
                    metadata: { system_type: 'join' },
                })

                sseService.broadcast(roomId, 'message.new', message)
            }
        }

        res.json(parsed)
    } catch (error) {
        console.error('[AI] /gemini/join:', error)
        res.status(500).json({ error: 'Не удалось сгенерировать данные персонажа' })
    }
})

apiRouter.post('/gemini/summarize', authMiddleware, aiLimiter, async (req, res) => {
    const validation = geminiSummarizeSchema.safeParse(req.body)

    if (!validation.success) {
        res.status(400).json({
            error: 'Некорректные данные',
            details: validation.error.flatten(),
        })
        return
    }

    const { currentSummary, recentMessages, roomId } = validation.data

    try {
        const room = await roomsRepository.findById(roomId)

        if (!room) {
            res.status(404).json({ error: 'Комната не найдена' })
            return
        }

        if (room.host_user_id !== req.user.id) {
            res.status(403).json({ error: 'Только хост может создавать сводку' })
            return
        }

        const prompt = [
            `Ты летописец RPG игры. Твоя задача — обновить краткое содержание сюжета.`,
            `Текущее содержание: ${currentSummary || 'Начало приключения.'}`,
            `Новые события: ${recentMessages}`,
            ``,
            `Напиши обновленное краткое содержание (не более 3-4 абзацев).`,
        ].join('\n')

        const summary = await generateWithFallback(prompt, {
            model: 'gemini-2.0-flash-lite',
        })

        await roomsRepository.update(roomId, { story_summary: summary })

        res.json({ text: summary })
    } catch (error) {
        console.error('[AI] /gemini/summarize:', error)
        res.status(500).json({ error: 'Не удалось создать сводку' })
    }
})

apiRouter.post('/gemini/generate', authMiddleware, aiLimiter, async (req, res) => {
    const validation = geminiGenerateSchema.safeParse(req.body)

    if (!validation.success) {
        res.status(400).json({
            error: 'Некорректные данные',
            details: validation.error.flatten(),
        })
        return
    }

    const {
        roomId, playersContext, recentMessages, actionsText,
        currentQuests, worldState, factions, hiddenTimers,
        gmTone, difficulty, goreLevel, language,
    } = validation.data

    // НЕМЕДЛЕННО отвечаем клиенту — не ждём AI
    res.json({ ok: true, message: 'Генерация начата' })

    // Генерация идёт асинхронно
    generateTurn({
        roomId, playersContext, recentMessages, actionsText,
        currentQuests, worldState, factions, hiddenTimers,
        gmTone, difficulty, goreLevel, language,
        hostUserId: req.user.id,
    }).catch(async (error) => {
        console.error('[AI] Критическая ошибка генерации хода:', error)

        // Уведомляем игроков об ошибке
        try {
            await roomsRepository.updateTurn(roomId, 0, 'waiting', '')
            const currentRoom = await roomsRepository.findById(roomId)
            if (currentRoom) {
                sseService.broadcast(roomId, 'room.updated', { turn_status: 'waiting', isGenerating: false })
            }
            sseService.broadcast(roomId, 'system.notification', {
                type: 'error',
                message: 'Мастер задумался слишком долго. Попробуйте ещё раз.',
                dismissible: true,
                duration: 5000,
            })
        } catch (cleanupError) {
            console.error('[AI] Ошибка cleanup после провала генерации:', cleanupError)
        }
    })
})

/**
 * Асинхронная генерация хода — вынесена из HTTP handler
 */
async function generateTurn(params: {
    roomId: string
    playersContext: unknown[]
    recentMessages: string
    actionsText: string
    currentQuests: unknown[]
    worldState: string
    factions: Record<string, unknown>
    hiddenTimers: Record<string, number>
    gmTone: string
    difficulty: string
    goreLevel: string
    language: string
    hostUserId: string
}): Promise<void> {
    const { roomId } = params

    const room = await roomsRepository.findById(roomId)
    if (!room) {
        throw new Error(`Комната ${roomId} не найдена`)
    }

    // Помечаем что AI генерирует
    await roomsRepository.updateTurn(room.id, room.turn_number, 'generating', room.story_summary)
    sseService.broadcast(roomId, 'room.updated', { turn_status: 'generating', isGenerating: true })

    const prompt = [
        `Ты — ГМ в текстовой RPG. Обработай действия игроков, развивай сюжет, обновляй мир.`,
        ``,
        `КОНТЕКСТ:`,
        `- Тон: ${params.gmTone}, Сложность: ${params.difficulty}, Жестокость: ${params.goreLevel}, Язык: ${params.language}`,
        `- Мир: ${params.worldState || 'Начало'}`,
        `- Квесты: ${JSON.stringify(params.currentQuests || [])}`,
        `- Фракции: ${JSON.stringify(params.factions || {})}`,
        `- Таймеры: ${JSON.stringify(params.hiddenTimers || {})}`,
        `- Игроки: ${JSON.stringify(params.playersContext || [])}`,
        `- События: ${params.recentMessages}`,
        `- Действия игроков: ${params.actionsText}`,
        ``,
        `ЗАДАЧА:`,
        `1. Опиши последствия действий с учётом характеристик игроков.`,
        `2. Обнови состояние игроков, мира, фракций и таймеров.`,
        `3. Выдели важные факты для энциклопедии (wikiCandidates).`,
        ``,
        `ВЕРНИ JSON по схеме:`,
        JSON.stringify({
            reasoning: 'Скрытые мысли ГМ',
            story: 'Художественное описание хода',
            worldUpdates: 'Обновление состояния мира',
            factionUpdates: { 'Фракция': 'Новый статус' },
            hiddenTimersUpdates: { 'Таймер': 1 },
            active_quests: [],
            stateUpdates: [{
                uid: 'ID игрока',
                hp: 100, mana: 50, stress: 0,
                alignment: 'true_neutral',
                inventory: [], skills: [], injuries: [],
                statuses: [], mutations: [],
                reputation: {},
                stats: { speed: 10, reaction: 10, strength: 10, power: 10, durability: 10, stamina: 10 },
            }],
            wikiCandidates: [{ name: 'Название', rawFacts: 'Факты', reason: 'Почему важно' }],
        }, null, 2),
    ].join('\n')

    const result = await generateWithValidation(prompt, {
        model: 'gemini-2.0-flash',
        responseMimeType: 'application/json',
    })

    // Сохраняем нарратив AI
    const aiMessage = await messagesRepository.create({
        room_id: roomId,
        user_id: null,
        type: 'dm_response',
        content: result.story,
        turn_number: room.turn_number,
        metadata: { reasoning: result.reasoning },
    })

    sseService.broadcast(roomId, 'message.new', aiMessage)

    // Обновляем состояния игроков в транзакции
    if (result.stateUpdates && result.stateUpdates.length > 0) {
        for (const update of result.stateUpdates) {
            try {
                // findByRoomAndUser ищет по user_id, не по внутреннему id
                const player = await playersRepository.findByRoomAndUser(roomId, update.uid)

                if (!player) {
                    console.warn(`[AI] Игрок ${update.uid} не найден в комнате ${roomId}`)
                    continue
                }

                const updatedPlayer = await playersRepository.updateState(player.id, {
                    hp: update.hp,
                    mana: update.mana,
                    stress: update.stress,
                    alignment: update.alignment as any,
                    inventory: update.inventory as any,
                    skills: update.skills as any,
                    injuries: update.injuries as any,
                    statuses: update.statuses as any,
                    mutations: update.mutations as any,
                    reputation: update.reputation as any,
                })

                if (updatedPlayer) {
                    sseService.broadcast(roomId, 'player.updated', updatedPlayer)
                }
            } catch (playerError) {
                // Ошибка одного игрока не должна остановить остальных
                console.error(`[AI] Ошибка обновления игрока ${update.uid}:`, playerError)
            }
        }
    }

    // Сбрасываем готовность всех игроков
    const allPlayers = await playersRepository.findByRoom(roomId)
    for (const p of allPlayers) {
        try {
            const resetPlayer = await playersRepository.updateAction(p.id, '', false)
            if (resetPlayer) {
                sseService.broadcast(roomId, 'player.updated', resetPlayer)
            }
        } catch (resetError) {
            console.error(`[AI] Ошибка сброса действия игрока ${p.id}:`, resetError)
        }
    }

    // Обновляем комнату
    const newTurn = room.turn_number + 1

    // Создаём новый объект настроек — не мутируем исходный
    const updatedWorldSettings = {
        ...room.world_settings,
        worldState: result.worldUpdates || (room.world_settings as any)?.worldState,
        factions: result.factionUpdates || (room.world_settings as any)?.factions,
        hiddenTimers: result.hiddenTimersUpdates || (room.world_settings as any)?.hiddenTimers,
    }

    await roomsRepository.update(roomId, {
        turn_number: newTurn,
        turn_status: 'waiting',
        active_quests: (result.active_quests as any) || room.active_quests,
        world_settings: updatedWorldSettings as any,
    })

    const updatedRoom = await roomsRepository.findById(roomId)
    if (updatedRoom) {
        sseService.broadcast(roomId, 'room.updated', updatedRoom)
    }
}

apiRouter.post('/gemini/archivist', authMiddleware, aiLimiter, async (req, res) => {
    const validation = geminiArchivistSchema.safeParse(req.body)

    if (!validation.success) {
        res.status(400).json({
            error: 'Некорректные данные',
            details: validation.error.flatten(),
        })
        return
    }

    const { candidates, roomId } = validation.data

    if (candidates.length === 0) {
        res.json({ success: true, processed: 0 })
        return
    }

    // Сразу отвечаем — обработка идёт в фоне
    res.json({ success: true, message: 'Архивариус начал работу' })

    // Обрабатываем кандидатов асинхронно
    processArchivistCandidates(candidates, roomId, req.user.id).catch((error) => {
        console.error('[Archivist] Критическая ошибка:', error)
    })
})

/**
 * Асинхронная обработка кандидатов в бестиарий
 */
async function processArchivistCandidates(
    candidates: Array<{ name: string; rawFacts: string; reason: string }>,
    roomId: string,
    userId: string
): Promise<void> {
    for (const candidate of candidates) {
        try {
            // Проверяем существующую запись
            const existingEntries = await bestiaryRepository.search(candidate.name)
            const existingEntry = existingEntries.find(
                e => e.title.toLowerCase() === candidate.name.toLowerCase()
            )

            const prompt = [
                `Ты — Магистр Элиас, Архивариус и летописец. Тебе принесли сырые факты о сущности/объекте/локации.`,
                `Реши, достойно ли это записи в Великую Энциклопедию.`,
                ``,
                `Если это банальщина (обычный волк, простой камень, крестьянин):`,
                `Верни: {"rejected": true, "reason": "Слишком банально"}`,
                ``,
                `Если достойно — напиши подробную, научную и атмосферную статью.`,
                ``,
                `Имя: ${candidate.name}`,
                `Сырые факты: ${candidate.rawFacts}`,
                `Причина добавления: ${candidate.reason}`,
                existingEntry
                    ? `\nСуществующая запись:\n${existingEntry.content}\nДОПОЛНИ её новыми фактами.`
                    : `\nЭто новая запись.`,
                ``,
                `Верни СТРОГО JSON:`,
                `{`,
                `  "rejected": false,`,
                `  "category": "Флора" | "Фауна" | "Артефакты" | "Магические Аномалии" | "Фракции" | "Исторические Личности" | "Локации" | "Заклинания",`,
                `  "nature": "positive" | "negative" | "neutral",`,
                `  "tags": ["тег1"],`,
                `  "level": 1 | 2 | 3,`,
                `  "content": "Текст статьи (Markdown)",`,
                `  "authorNotes": "Сноска автора (опционально)"`,
                `}`,
            ].join('\n')

            const text = await generateWithFallback(prompt, {
                responseMimeType: 'application/json',
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        rejected: { type: Type.BOOLEAN },
                        reason: { type: Type.STRING },
                        category: { type: Type.STRING },
                        nature: { type: Type.STRING },
                        tags: { type: Type.ARRAY, items: { type: Type.STRING } },
                        level: { type: Type.NUMBER },
                        content: { type: Type.STRING },
                        authorNotes: { type: Type.STRING },
                    },
                },
            })

            const parsed = parseAIJson(text) as {
                rejected: boolean
                reason?: string
                category?: string
                nature?: string
                tags?: string[]
                level?: number
                content?: string
                authorNotes?: string
            }

            if (parsed.rejected) {
                console.log(`[Archivist] Отклонено ${candidate.name}: ${parsed.reason}`)
                continue
            }

            if (existingEntry) {
                // Обновляем существующую запись через репозиторий
                await bestiaryRepository.update(existingEntry.id, {
                    category: parsed.category as any,
                    nature: (parsed.nature || 'neutral') as any,
                    tags: parsed.tags || [],
                    knowledge_level: (parsed.level || 1) as any,
                    content: parsed.content || '',
                    author_notes: parsed.authorNotes || null,
                })
            } else {
                // Создаём новую запись
                await bestiaryRepository.create({
                    slug: candidate.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, ''),
                    title: candidate.name,
                    category: parsed.category as any,
                    nature: (parsed.nature || 'neutral') as any,
                    tags: parsed.tags || [],
                    knowledge_level: (parsed.level || 1) as any,
                    content: parsed.content || '',
                    author_notes: parsed.authorNotes || null,
                    source_room_id: roomId,
                    discovered_by_user_id: userId,
                })
            }

            console.log(`[Archivist] Обработано: ${candidate.name}`)
        } catch (error) {
            console.error(`[Archivist] Ошибка обработки ${candidate.name}:`, error)
            // Продолжаем обработку остальных кандидатов
        }
    }
}

// ─── Messages API ─────────────────────────────────────────────────────────────

apiRouter.get('/rooms/:roomId/messages', authMiddleware, async (req, res) => {
    try {
        const room = await resolveRoom(req.params.roomId)

        if (!room) {
            res.status(404).json({ error: 'Комната не найдена' })
            return
        }

        const page = Math.max(1, parseInt(String(req.query.page || '1'), 10))
        const pageSize = Math.max(1, Math.min(100, parseInt(String(req.query.page_size || '50'), 10)))

        const result = await messagesRepository.findByRoom(room.id, page, pageSize)
        res.json(result)
    } catch (error) {
        console.error('[API] GET /rooms/:roomId/messages:', error)
        res.status(500).json({ error: 'Не удалось получить сообщения' })
    }
})

apiRouter.post('/rooms/:roomId/messages', authMiddleware, async (req, res) => {
    const validation = sendMessageSchema.safeParse(req.body)

    if (!validation.success) {
        res.status(400).json({
            error: 'Некорректные данные',
            details: validation.error.flatten(),
        })
        return
    }

    const { content, type, turn_number, metadata } = validation.data

    try {
        const room = await resolveRoom(req.params.roomId)

        if (!room) {
            res.status(404).json({ error: 'Комната не найдена' })
            return
        }

        const message = await messagesRepository.create({
            room_id: room.id,
            user_id: req.user.id,
            type,
            content,
            metadata,
            turn_number: turn_number || room.turn_number,
        })

        sseService.broadcast(room.id, 'message.new', message)
        res.status(201).json(message)
    } catch (error) {
        console.error('[API] POST /rooms/:roomId/messages:', error)
        res.status(500).json({ error: 'Не удалось отправить сообщение' })
    }
})