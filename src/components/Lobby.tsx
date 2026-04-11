// src/views/Lobby.tsx

import React, { useState, useEffect, useCallback, useMemo } from 'react'
import {
    Plus, LogIn, BookOpen, PlayCircle,
    Bug, Settings, LogOut, Users, AlertCircle,
} from 'lucide-react'
import { cn } from '../lib/utils'
import { supabase, logout } from '../supabase'
import { api } from '../services/api'
import { SkeletonCard } from '../components/ui/Skeleton'
import type { AppSettings, RoomRow } from '../types'

// ─── Типы ─────────────────────────────────────────────────────────────────────

interface LobbyProps {
    onOpenBestiary: () => void
    onOpenSettings: () => void
    onOpenReport: () => void
    appSettings: AppSettings
    onRoomSelected: (roomId: string) => void
}

// ─── Константы ────────────────────────────────────────────────────────────────

const DEFAULT_SCENARIO = 'Вы очнулись в темной, сырой пещере. Вы не помните, как сюда попали. Вдалеке мерцает тусклый свет.'

const JOIN_CODE_LENGTH = 6
const JOIN_CODE_REGEX = /^[A-Z0-9]{6}$/

// ─── Хуки ─────────────────────────────────────────────────────────────────────

/**
 * Хук для получения текущей сессии
 */
function useSession() {
    const [session, setSession] = useState<any>(null)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        supabase.auth.getSession().then(({ data: { session } }) => {
            setSession(session)
            setLoading(false)
        })

        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            setSession(session)
        })

        return () => subscription.unsubscribe()
    }, [])

    return { session, loading }
}

/**
 * Хук для загрузки комнат
 */
function useRooms() {
    const [rooms, setRooms] = useState<RoomRow[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    const loadRooms = useCallback(async () => {
        setLoading(true)
        setError(null)

        try {
            const data = await api.getRooms()
            setRooms(data)
        } catch (err) {
            console.error('[Lobby] Ошибка загрузки комнат:', err)
            setError('Не удалось загрузить список комнат')
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => {
        loadRooms()
    }, [loadRooms])

    return { rooms, loading, error, reload: loadRooms }
}

/**
 * Валидация join code
 */
function validateJoinCode(code: string): { valid: boolean; error?: string } {
    if (!code || code.length === 0) {
        return { valid: false, error: 'Введите код' }
    }

    if (code.length !== JOIN_CODE_LENGTH) {
        return { valid: false, error: `Код должен быть ${JOIN_CODE_LENGTH} символов` }
    }

    if (!JOIN_CODE_REGEX.test(code)) {
        return { valid: false, error: 'Только буквы A-Z и цифры 0-9' }
    }

    return { valid: true }
}

// ─── Компоненты ───────────────────────────────────────────────────────────────

interface RoomCardProps {
    room: RoomRow
    onClick: () => void
    isLight: boolean
}

const RoomCard: React.FC<RoomCardProps> = ({ room, onClick, isLight }) => {
    const scenario = room.world_settings?.scenario || 'Без описания'

    // TODO: получить реальное количество игроков из БД
    const playersCount = 0 // room.players?.length || 0
    const maxPlayers = room.world_settings?.max_players || 6

    return (
        <button
            onClick={onClick}
            className={cn(
                'w-full border p-3 rounded-2xl text-left transition-all group',
                'focus:outline-none focus:ring-2 focus:ring-orange-500',
                isLight
                    ? 'bg-white border-neutral-200 hover:border-orange-500/50 shadow-sm'
                    : 'bg-neutral-900/50 border-neutral-800 hover:border-orange-500/50'
            )}
            aria-label={`Войти в комнату ${room.join_code}`}
        >
            <div className="flex justify-between items-center mb-2">
                {/* Код комнаты */}
                <span className="font-mono text-xs text-orange-500 bg-orange-500/10 px-2 py-1 rounded font-bold">
                    {room.join_code}
                </span>

                {/* Статус и количество игроков */}
                <div className="flex items-center gap-2">
                    {/* Индикатор статуса */}
                    <div
                        className={cn(
                            'w-2 h-2 rounded-full',
                            room.status === 'lobby'
                                ? 'bg-green-500'
                                : room.status === 'playing'
                                    ? 'bg-orange-500'
                                    : 'bg-neutral-500'
                        )}
                        title={
                            room.status === 'lobby'
                                ? 'В лобби'
                                : room.status === 'playing'
                                    ? 'Играют'
                                    : 'Завершена'
                        }
                        aria-hidden="true"
                    />

                    {/* Счётчик игроков */}
                    <div
                        className={cn(
                            'flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest',
                            isLight ? 'text-neutral-400' : 'text-neutral-500'
                        )}
                    >
                        <Users size={12} aria-hidden="true" />
                        <span aria-label={`${playersCount} из ${maxPlayers} игроков`}>
                            {playersCount} / {maxPlayers}
                        </span>
                    </div>
                </div>
            </div>

            {/* Описание сценария */}
            <p
                className={cn(
                    'text-sm line-clamp-2 italic',
                    isLight ? 'text-neutral-600' : 'text-neutral-400'
                )}
            >
                "{scenario}"
            </p>
        </button>
    )
}

// ─── Основной компонент ───────────────────────────────────────────────────────

export default function Lobby({
    onOpenBestiary,
    onOpenSettings,
    onOpenReport,
    appSettings,
    onRoomSelected,
}: LobbyProps) {
    const isLight = appSettings.theme === 'light'

    const { session } = useSession()
    const { rooms, loading: loadingRooms, error: roomsError, reload } = useRooms()

    const [joinCode, setJoinCode] = useState('')
    const [scenario, setScenario] = useState(DEFAULT_SCENARIO)
    const [isCreating, setIsCreating] = useState(false)
    const [isJoining, setIsJoining] = useState(false)
    const [error, setError] = useState<string | null>(null)

    // Только активные комнаты (не завершённые)
    const activeRooms = useMemo(
        () => rooms.filter((r) => r.status !== 'finished'),
        [rooms]
    )

    // Валидация join code в реальном времени
    const joinCodeValidation = useMemo(
        () => validateJoinCode(joinCode.trim()),
        [joinCode]
    )

    // ─── Обработчики ──────────────────────────────────────────────────────────

    const handleCreateRoom = useCallback(async () => {
        if (!session) {
            setError('Необходима авторизация')
            return
        }

        if (!scenario.trim()) {
            setError('Введите описание сценария')
            return
        }

        setIsCreating(true)
        setError(null)

        try {
            const room = await api.createRoom(scenario.trim())
            onRoomSelected(room.id)
        } catch (err) {
            console.error('[Lobby] Ошибка создания комнаты:', err)
            setError('Не удалось создать комнату. Попробуйте снова.')
        } finally {
            setIsCreating(false)
        }
    }, [session, scenario, onRoomSelected])

    const handleJoinRoom = useCallback(
        async (e: React.FormEvent) => {
            e.preventDefault()

            if (!session) {
                setError('Необходима авторизация')
                return
            }

            const validation = validateJoinCode(joinCode.trim())
            if (!validation.valid) {
                setError(validation.error || 'Некорректный код')
                return
            }

            setIsJoining(true)
            setError(null)

            try {
                // Находим комнату по join code
                const foundRoom = rooms.find(
                    (r) => r.join_code === joinCode.trim().toUpperCase()
                )

                if (foundRoom) {
                    onRoomSelected(foundRoom.id)
                } else {
                    // Пробуем присоединиться напрямую — комнаты может не быть в списке
                    // если пользователь ещё не игрок в ней
                    onRoomSelected(joinCode.trim().toUpperCase())
                }
            } catch (err) {
                console.error('[Lobby] Ошибка входа в комнату:', err)
                setError('Не удалось войти в комнату. Проверьте код.')
            } finally {
                setIsJoining(false)
            }
        },
        [session, joinCode, rooms, onRoomSelected]
    )

    const handleSwitchRoom = useCallback(
        (roomId: string) => {
            onRoomSelected(roomId)
        },
        [onRoomSelected]
    )

    const handleLogout = useCallback(() => {
        logout()
    }, [])

    // ─── Рендер ───────────────────────────────────────────────────────────────

    return (
        <div
            className={cn(
                'flex-1 flex flex-col overflow-hidden relative h-full',
                isLight ? 'bg-neutral-50' : 'bg-black'
            )}
        >
            {/* Scrollable Content */}
            <div className="flex-1 overflow-y-auto p-4">
                <div className="w-full space-y-6 pb-6">
                    {/* Общая ошибка */}
                    {error && (
                        <div
                            className="flex items-center gap-3 p-4 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-500"
                            role="alert"
                        >
                            <AlertCircle size={20} className="shrink-0" />
                            <p className="text-sm">{error}</p>
                        </div>
                    )}

                    {/* Активные сессии */}
                    {loadingRooms ? (
                        <div className="space-y-3">
                            <h2
                                className={cn(
                                    'text-base font-bold flex items-center gap-2 uppercase tracking-widest',
                                    isLight ? 'text-neutral-500' : 'text-neutral-400'
                                )}
                            >
                                <PlayCircle size={20} className="text-orange-500" />
                                Загрузка комнат...
                            </h2>
                            <SkeletonCard isLight={isLight} />
                            <SkeletonCard isLight={isLight} />
                        </div>
                    ) : roomsError ? (
                        <div
                            className="p-4 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-500"
                            role="alert"
                        >
                            <p className="text-sm">{roomsError}</p>
                            <button
                                onClick={reload}
                                className="mt-2 text-xs underline"
                            >
                                Повторить попытку
                            </button>
                        </div>
                    ) : activeRooms.length > 0 ? (
                        <section className="w-full space-y-3">
                            <h2
                                className={cn(
                                    'text-base font-bold flex items-center gap-2 uppercase tracking-widest',
                                    isLight ? 'text-neutral-500' : 'text-neutral-400'
                                )}
                            >
                                <PlayCircle size={20} className="text-orange-500" aria-hidden="true" />
                                Активные сессии
                            </h2>
                            <div className="grid gap-2" role="list">
                                {activeRooms.map((room) => (
                                    <RoomCard
                                        key={room.id}
                                        room={room}
                                        onClick={() => handleSwitchRoom(room.id)}
                                        isLight={isLight}
                                    />
                                ))}
                            </div>
                        </section>
                    ) : null}

                    <div className="grid grid-cols-1 gap-4">
                        {/* Создание комнаты */}
                        <section
                            className={cn(
                                'border rounded-3xl p-6 space-y-5',
                                isLight
                                    ? 'bg-white border-neutral-200 shadow-sm'
                                    : 'bg-neutral-900/50 border-neutral-800'
                            )}
                        >
                            <h2
                                className={cn(
                                    'text-base font-bold flex items-center gap-2 uppercase tracking-widest',
                                    isLight ? 'text-neutral-900' : 'text-white'
                                )}
                            >
                                <Plus size={24} className="text-orange-500" aria-hidden="true" />
                                Новая игра
                            </h2>

                            <label htmlFor="scenario" className="sr-only">
                                Описание сценария
                            </label>
                            <textarea
                                id="scenario"
                                value={scenario}
                                onChange={(e) => setScenario(e.target.value)}
                                rows={4}
                                maxLength={2000}
                                className={cn(
                                    'w-full border rounded-2xl p-4 text-base',
                                    'focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500',
                                    'outline-none resize-none transition-all',
                                    isLight
                                        ? 'bg-neutral-50 border-neutral-200 text-neutral-900'
                                        : 'bg-black border-neutral-800 text-neutral-100'
                                )}
                                placeholder="Опишите стартовую ситуацию..."
                            />

                            <button
                                onClick={handleCreateRoom}
                                disabled={isCreating || !scenario.trim()}
                                className={cn(
                                    'w-full bg-orange-600 hover:bg-orange-500 text-white',
                                    'font-bold py-4 px-4 rounded-2xl transition-all',
                                    'active:scale-95 disabled:opacity-50 disabled:scale-100',
                                    'text-base shadow-lg shadow-orange-600/20',
                                    'focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-2'
                                )}
                            >
                                {isCreating ? 'Создание...' : 'Создать комнату'}
                            </button>
                        </section>

                        {/* Присоединение */}
                        <section
                            className={cn(
                                'border rounded-3xl p-6 space-y-5',
                                isLight
                                    ? 'bg-white border-neutral-200 shadow-sm'
                                    : 'bg-neutral-900/50 border-neutral-800'
                            )}
                        >
                            <h2
                                className={cn(
                                    'text-base font-bold flex items-center gap-2 uppercase tracking-widest',
                                    isLight ? 'text-neutral-900' : 'text-white'
                                )}
                            >
                                <LogIn size={24} className="text-orange-500" aria-hidden="true" />
                                Присоединиться
                            </h2>

                            <form onSubmit={handleJoinRoom} className="space-y-3">
                                <div className="flex gap-3">
                                    <label htmlFor="join-code" className="sr-only">
                                        Код комнаты
                                    </label>
                                    <input
                                        id="join-code"
                                        type="text"
                                        value={joinCode}
                                        onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                                        className={cn(
                                            'flex-1 min-w-0 border rounded-2xl p-4 text-base',
                                            'focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500',
                                            'outline-none uppercase tracking-widest font-mono transition-all',
                                            isLight
                                                ? 'bg-neutral-50 border-neutral-200 text-neutral-900'
                                                : 'bg-black border-neutral-800 text-neutral-100',
                                            joinCode && !joinCodeValidation.valid && 'border-red-500'
                                        )}
                                        placeholder="КОД"
                                        maxLength={JOIN_CODE_LENGTH}
                                        autoComplete="off"
                                        spellCheck={false}
                                    />

                                    <button
                                        type="submit"
                                        disabled={!joinCodeValidation.valid || isJoining}
                                        className={cn(
                                            'font-bold px-6 rounded-2xl transition-all',
                                            'active:scale-95 disabled:opacity-50 disabled:scale-100',
                                            'text-base shrink-0',
                                            'focus:outline-none focus:ring-2 focus:ring-orange-500',
                                            isLight
                                                ? 'bg-neutral-100 hover:bg-neutral-200 text-neutral-900'
                                                : 'bg-neutral-800 hover:bg-neutral-700 text-white'
                                        )}
                                    >
                                        {isJoining ? 'Вход...' : 'Войти'}
                                    </button>
                                </div>

                                {/* Ошибка валидации */}
                                {joinCode && !joinCodeValidation.valid && (
                                    <p
                                        className="text-xs text-red-500"
                                        role="alert"
                                        aria-live="polite"
                                    >
                                        {joinCodeValidation.error}
                                    </p>
                                )}
                            </form>
                        </section>
                    </div>

                    {/* Бестиарий */}
                    <button
                        onClick={onOpenBestiary}
                        className={cn(
                            'w-full border font-bold py-5 px-4 rounded-3xl',
                            'transition-all active:scale-95',
                            'flex items-center justify-center gap-3',
                            'text-base uppercase tracking-widest',
                            'focus:outline-none focus:ring-2 focus:ring-orange-500',
                            isLight
                                ? 'bg-white border-neutral-200 hover:bg-neutral-50 text-neutral-900 shadow-sm'
                                : 'bg-neutral-900/50 border-neutral-800 hover:bg-neutral-800 text-white'
                        )}
                    >
                        <BookOpen size={24} className="text-orange-500" aria-hidden="true" />
                        Бестиарий
                    </button>
                </div>
            </div>

            {/* Footer Navigation */}
            <footer
                className={cn(
                    'shrink-0 p-4 backdrop-blur-md border-t',
                    'flex justify-around items-center z-20',
                    // Используем env(safe-area-inset-bottom) для iOS
                    '[padding-bottom:max(1rem,env(safe-area-inset-bottom))]',
                    isLight
                        ? 'bg-white/90 border-neutral-200'
                        : 'bg-black/90 border-neutral-900'
                )}
            >
                <button
                    onClick={onOpenReport}
                    className={cn(
                        'flex flex-col items-center gap-1.5 transition-colors p-2',
                        'focus:outline-none focus:ring-2 focus:ring-orange-500 rounded-lg',
                        isLight
                            ? 'text-neutral-400 hover:text-neutral-900'
                            : 'text-neutral-500 hover:text-white'
                    )}
                    aria-label="Сообщить об ошибке"
                >
                    <Bug size={24} aria-hidden="true" />
                    <span className="text-[10px] font-bold uppercase tracking-tighter">
                        Баги
                    </span>
                </button>

                <button
                    onClick={onOpenSettings}
                    className={cn(
                        'flex flex-col items-center gap-1.5 transition-colors p-2',
                        'focus:outline-none focus:ring-2 focus:ring-orange-500 rounded-lg',
                        isLight
                            ? 'text-neutral-400 hover:text-neutral-900'
                            : 'text-neutral-500 hover:text-white'
                    )}
                    aria-label="Настройки"
                >
                    <Settings size={24} aria-hidden="true" />
                    <span className="text-[10px] font-bold uppercase tracking-tighter">
                        Опции
                    </span>
                </button>

                <button
                    onClick={handleLogout}
                    className={cn(
                        'flex flex-col items-center gap-1.5 transition-colors p-2',
                        'focus:outline-none focus:ring-2 focus:ring-red-500 rounded-lg',
                        isLight
                            ? 'text-neutral-400 hover:text-red-500'
                            : 'text-neutral-500 hover:text-red-400'
                    )}
                    aria-label="Выйти из аккаунта"
                >
                    <LogOut size={24} aria-hidden="true" />
                    <span className="text-[10px] font-bold uppercase tracking-tighter">
                        Выход
                    </span>
                </button>
            </footer>
        </div>
    )
}

Lobby.displayName = 'Lobby'