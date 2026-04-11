// server/services/sse.service.ts

import { Response } from 'express'
import type { SSEEventMap, SSEEventName, SSEEventData } from '../database/types'

// ─── Типы ─────────────────────────────────────────────────────────────────────

interface SSEClient {
    id: string          // уникальный ID соединения
    userId: string      // ID пользователя
    roomId: string      // ID комнаты
    res: Response       // Express Response объект
    connectedAt: number // timestamp подключения
    lastPing: number    // timestamp последней активности
}

export interface SSEStats {
    totalClients: number
    rooms: Record<string, {
        clientCount: number
        clients: Array<{
            id: string
            userId: string
            connectedAt: string
            lastPing: string
        }>
    }>
}

// ─── SSE Service ──────────────────────────────────────────────────────────────

class SSEService {
    // roomId → Map<clientId, SSEClient>
    // Map внутри Map для O(1) добавления и удаления
    private rooms: Map<string, Map<string, SSEClient>> = new Map()

    private clientCounter = 0

    // Максимум клиентов в одной комнате (защита от abuse)
    private readonly MAX_CLIENTS_PER_ROOM = 50

    // Интервал keepalive в мс
    private readonly KEEPALIVE_INTERVAL = 20000

    // Таймаут мёртвого соединения в мс (2 минуты)
    private readonly STALE_TIMEOUT = 120000

    constructor() {
        // Keepalive для всех соединений каждые 20 секунд
        setInterval(() => this.pingAll(), this.KEEPALIVE_INTERVAL)

        // Очистка мёртвых соединений каждую минуту
        setInterval(() => this.cleanupStale(), 60000)
    }

    // ─── Публичные методы ──────────────────────────────────────────────────────

    /**
     * Регистрация нового SSE клиента
     * Вызывается ПОСЛЕ установки SSE заголовков в роуте
     * 
     * @returns clientId для последующего removeClient
     */
    addClient(roomId: string, userId: string, res: Response): string {
        const clientId = `${userId}-${++this.clientCounter}`

        // Инициализируем комнату если не существует
        if (!this.rooms.has(roomId)) {
            this.rooms.set(roomId, new Map())
        }

        const room = this.rooms.get(roomId)!

        // Защита от переполнения
        if (room.size >= this.MAX_CLIENTS_PER_ROOM) {
            console.warn(
                `[SSE] Комната ${roomId} достигла лимита клиентов (${this.MAX_CLIENTS_PER_ROOM}). ` +
                `Отклоняем клиента ${clientId}`
            )
            try {
                res.end()
            } catch {}
            return clientId
        }

        const client: SSEClient = {
            id: clientId,
            userId,
            roomId,
            res,
            connectedAt: Date.now(),
            lastPing: Date.now(),
        }

        room.set(clientId, client)

        console.log(
            `[SSE] +клиент ${clientId} (user: ${userId}) → комната ${roomId} ` +
            `(всего в комнате: ${room.size})`
        )

        return clientId
    }

    /**
     * Удаление клиента по clientId
     * Вызывается при req.on('close') в роуте
     */
    removeClient(roomId: string, clientId: string): void {
        const room = this.rooms.get(roomId)
        if (!room) return

        const client = room.get(clientId)
        if (!client) return

        room.delete(clientId)

        // Удаляем пустую комнату
        if (room.size === 0) {
            this.rooms.delete(roomId)
        }

        console.log(
            `[SSE] -клиент ${clientId} ← комната ${roomId} ` +
            `(осталось: ${room?.size ?? 0})`
        )
    }

    /**
     * Отправить событие конкретному клиенту по clientId
     */
    sendToClient<T extends SSEEventName>(
        clientId: string,
        event: T,
        data: SSEEventData<T>
    ): void {
        // Ищем клиента по всем комнатам
        for (const [roomId, room] of this.rooms) {
            const client = room.get(clientId)
            if (client) {
                const success = this.writeToClient(client, event, data)
                if (!success) {
                    this.removeClient(roomId, clientId)
                }
                return
            }
        }

        console.warn(`[SSE] sendToClient: клиент ${clientId} не найден`)
    }

    /**
     * Отправить событие конкретному пользователю
     * (во все его вкладки/соединения)
     */
    sendToUser<T extends SSEEventName>(
        userId: string,
        event: T,
        data: SSEEventData<T>
    ): void {
        const deadClients: Array<{ roomId: string; clientId: string }> = []

        this.rooms.forEach((room, roomId) => {
            room.forEach((client, clientId) => {
                if (client.userId !== userId) return

                const success = this.writeToClient(client, event, data)
                if (!success) {
                    deadClients.push({ roomId, clientId })
                }
            })
        })

        deadClients.forEach(({ roomId, clientId }) => {
            this.removeClient(roomId, clientId)
        })
    }

    /**
     * Рассылка события всем клиентам в комнате
     * O(n) где n = количество клиентов в комнате
     */
    broadcast<T extends SSEEventName>(
        roomId: string,
        event: T,
        data: SSEEventData<T>
    ): void {
        const room = this.rooms.get(roomId)

        if (!room || room.size === 0) {
            // Нет клиентов — нормальная ситуация, не логируем
            return
        }

        const deadClients: string[] = []

        room.forEach((client, clientId) => {
            const success = this.writeToClient(client, event, data)
            if (!success) {
                deadClients.push(clientId)
            }
        })

        // Чистим мёртвые соединения
        deadClients.forEach(clientId => this.removeClient(roomId, clientId))
    }

    /**
     * Рассылка всем клиентам сервера (системные уведомления)
     */
    broadcastAll<T extends SSEEventName>(
        event: T,
        data: SSEEventData<T>
    ): void {
        this.rooms.forEach((_, roomId) => {
            this.broadcast(roomId, event, data)
        })
    }

    /**
     * Проверить подключён ли пользователь к комнате
     */
    isUserInRoom(roomId: string, userId: string): boolean {
        const room = this.rooms.get(roomId)
        if (!room) return false

        for (const client of room.values()) {
            if (client.userId === userId) return true
        }

        return false
    }

    /**
     * Получить количество клиентов в комнате
     */
    getRoomClientCount(roomId: string): number {
        return this.rooms.get(roomId)?.size ?? 0
    }

    /**
     * Получить список уникальных userId в комнате
     */
    getRoomUsers(roomId: string): string[] {
        const room = this.rooms.get(roomId)
        if (!room) return []

        const userIds = new Set<string>()
        room.forEach(client => userIds.add(client.userId))

        return Array.from(userIds)
    }

    /**
     * Статистика для мониторинга
     */
    getStats(): SSEStats {
        let totalClients = 0
        const rooms: SSEStats['rooms'] = {}

        this.rooms.forEach((room, roomId) => {
            totalClients += room.size

            rooms[roomId] = {
                clientCount: room.size,
                clients: Array.from(room.values()).map(client => ({
                    id: client.id,
                    userId: client.userId,
                    connectedAt: new Date(client.connectedAt).toISOString(),
                    lastPing: new Date(client.lastPing).toISOString(),
                })),
            }
        })

        return { totalClients, rooms }
    }

    // ─── Приватные методы ──────────────────────────────────────────────────────

    /**
     * Форматирование SSE сообщения согласно спецификации W3C
     * https://html.spec.whatwg.org/multipage/server-sent-events.html
     */
    private formatSSEMessage(event: string, data: unknown): string {
        const id = Date.now()
        const jsonData = JSON.stringify(data)

        // Многострочные data: каждая строка с префиксом
        const dataLines = jsonData
            .split('\n')
            .map(line => `data: ${line}`)
            .join('\n')

        return `id: ${id}\nevent: ${event}\n${dataLines}\n\n`
    }

    /**
     * Безопасная запись в соединение
     * Возвращает false если клиент недоступен
     */
    private writeToClient<T extends SSEEventName>(
        client: SSEClient,
        event: T,
        data: SSEEventData<T>
    ): boolean {
        try {
            // Проверяем что соединение живо
            if (client.res.writableEnded || client.res.destroyed) {
                return false
            }

            const message = this.formatSSEMessage(event as string, data)
            client.res.write(message)
            client.lastPing = Date.now()

            return true
        } catch (error) {
            // ECONNRESET, EPIPE — клиент отключился
            const errorMessage = (error as NodeJS.ErrnoException).message || ''

            if (!['ECONNRESET', 'EPIPE', 'ERR_HTTP_HEADERS_SENT'].includes(
                (error as NodeJS.ErrnoException).code || ''
            )) {
                console.error(
                    `[SSE] Ошибка записи клиенту ${client.id}:`,
                    errorMessage
                )
            }

            return false
        }
    }

    /**
     * Keepalive — предотвращает таймаут прокси/nginx
     * Отправляет SSE комментарий (не триггерит обработчики на клиенте)
     */
    private pingAll(): void {
        const deadClients: Array<{ roomId: string; clientId: string }> = []
        const pingMessage = ': keepalive\n\n'

        this.rooms.forEach((room, roomId) => {
            room.forEach((client, clientId) => {
                try {
                    if (client.res.writableEnded || client.res.destroyed) {
                        deadClients.push({ roomId, clientId })
                        return
                    }

                    client.res.write(pingMessage)
                    client.lastPing = Date.now()
                } catch {
                    deadClients.push({ roomId, clientId })
                }
            })
        })

        if (deadClients.length > 0) {
            deadClients.forEach(({ roomId, clientId }) => {
                this.removeClient(roomId, clientId)
            })
            console.log(`[SSE] Keepalive очистил ${deadClients.length} мёртвых соединений`)
        }
    }

    /**
     * Очистка соединений которые не отвечали долго
     * На случай если close event не сработал (мобильные сети, NAT timeout)
     */
    private cleanupStale(): void {
        const now = Date.now()
        const deadClients: Array<{ roomId: string; clientId: string }> = []

        this.rooms.forEach((room, roomId) => {
            room.forEach((client, clientId) => {
                const silent = now - client.lastPing

                if (silent > this.STALE_TIMEOUT) {
                    console.warn(
                        `[SSE] Клиент ${clientId} молчит ${Math.round(silent / 1000)}с — закрываем`
                    )

                    try {
                        client.res.end()
                    } catch {}

                    deadClients.push({ roomId, clientId })
                }
            })
        })

        if (deadClients.length > 0) {
            deadClients.forEach(({ roomId, clientId }) => {
                this.removeClient(roomId, clientId)
            })
            console.log(`[SSE] Cleanup удалил ${deadClients.length} зависших соединений`)
        }
    }
}

// Синглтон — один инстанс на всё приложение
export const sseService = new SSEService()