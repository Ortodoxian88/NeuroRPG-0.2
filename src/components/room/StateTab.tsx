// src/components/room/StateTab.tsx

import React, { useMemo } from 'react'
import { cn } from '@/src/lib/utils'
import type { Player, AppSettings, CharacterStatuses, CharacterMutations } from '@/src/types'
import {
    Heart, Zap, Shield, Sword, Brain, Eye, User, Activity,
    AlertCircle, Sparkles, Wind, Star, Flame, Target,
    Info, Clock, TrendingUp, TrendingDown,
} from 'lucide-react'

// ─── Типы ─────────────────────────────────────────────────────────────────────

interface StateTabProps {
    me?: Player
    appSettings?: AppSettings
}

type StatKey = 'strength' | 'dexterity' | 'constitution' | 'intelligence' | 'wisdom' | 'charisma'

interface StatConfig {
    label: string
    key: StatKey
    icon: React.ElementType
    color: string
}

// ─── Константы ────────────────────────────────────────────────────────────────

const STATS_CONFIG: StatConfig[] = [
    { label: 'СИЛ', key: 'strength', icon: Sword, color: 'text-red-400' },
    { label: 'ЛОВ', key: 'dexterity', icon: Wind, color: 'text-green-400' },
    { label: 'ТЕЛ', key: 'constitution', icon: Shield, color: 'text-blue-400' },
    { label: 'ИНТ', key: 'intelligence', icon: Brain, color: 'text-purple-400' },
    { label: 'МУД', key: 'wisdom', icon: Eye, color: 'text-cyan-400' },
    { label: 'ХАР', key: 'charisma', icon: Sparkles, color: 'text-pink-400' },
]

const STATUS_TYPE_COLORS = {
    buff: { bg: 'bg-green-500/10', border: 'border-green-500/30', text: 'text-green-400' },
    debuff: { bg: 'bg-red-500/10', border: 'border-red-500/30', text: 'text-red-400' },
    neutral: { bg: 'bg-blue-500/10', border: 'border-blue-500/30', text: 'text-blue-400' },
}

const MUTATION_TYPE_COLORS = {
    beneficial: { bg: 'bg-green-500/10', border: 'border-green-500/30', text: 'text-green-400' },
    detrimental: { bg: 'bg-orange-500/10', border: 'border-orange-500/30', text: 'text-orange-400' },
    neutral: { bg: 'bg-purple-500/10', border: 'border-purple-500/30', text: 'text-purple-400' },
}

// ─── Компоненты ───────────────────────────────────────────────────────────────

interface ProgressBarProps {
    current: number
    max: number
    color: string
    label: string
    icon: React.ElementType
    isLight: boolean
    showWarning?: boolean
}

const ProgressBar: React.FC<ProgressBarProps> = ({
    current,
    max,
    color,
    label,
    icon: Icon,
    isLight,
    showWarning = false,
}) => {
    const percentage = Math.min(100, Math.max(0, (current / max) * 100))
    const isLow = percentage < 25
    const isCritical = percentage < 10

    return (
        <div className="space-y-2">
            <div className="flex justify-between items-end px-1">
                <div className="flex items-center gap-2">
                    <Icon
                        size={16}
                        className={cn(
                            'shrink-0',
                            isLight ? 'text-orange-600/70' : 'text-orange-500/70'
                        )}
                        aria-hidden="true"
                    />
                    <span
                        className={cn(
                            'text-xs font-bold uppercase tracking-wider',
                            isLight ? 'text-neutral-500' : 'text-neutral-400'
                        )}
                    >
                        {label}
                    </span>

                    {showWarning && (isCritical || isLow) && (
                        <AlertCircle
                            size={12}
                            className={cn('shrink-0', isCritical ? 'text-red-500 animate-pulse' : 'text-yellow-500')}
                            aria-label={isCritical ? 'Критически низко' : 'Низкий уровень'}
                        />
                    )}
                </div>

                <div className="flex items-baseline gap-1">
                    <span
                        className={cn(
                            'text-base font-bold tabular-nums',
                            isLight ? 'text-neutral-900' : 'text-white'
                        )}
                    >
                        {current}
                    </span>
                    <span
                        className={cn(
                            'text-[10px] font-medium tabular-nums',
                            isLight ? 'text-neutral-400' : 'text-neutral-600'
                        )}
                    >
                        / {max}
                    </span>
                </div>
            </div>

            <div
                role="progressbar"
                aria-valuenow={current}
                aria-valuemin={0}
                aria-valuemax={max}
                aria-label={`${label}: ${current} из ${max}`}
                className={cn(
                    'h-3 w-full rounded-full overflow-hidden border p-0.5',
                    isLight ? 'bg-neutral-200 border-neutral-300' : 'bg-neutral-900 border-neutral-800'
                )}
            >
                <div
                    className={cn('h-full rounded-full transition-all duration-700 ease-out', color)}
                    style={{ width: `${percentage}%` }}
                />
            </div>
        </div>
    )
}

interface StatCardProps {
    label: string
    value: number
    icon: React.ElementType
    color: string
    isLight: boolean
}

const StatCard: React.FC<StatCardProps> = ({ label, value, icon: Icon, color, isLight }) => {
    // Модификатор для D&D правил: (значение - 10) / 2
    const modifier = Math.floor((value - 10) / 2)
    const modifierText = modifier >= 0 ? `+${modifier}` : `${modifier}`

    return (
        <div
            className={cn(
                'p-4 rounded-2xl flex flex-col items-center justify-center',
                'space-y-2 transition-all group border',
                isLight
                    ? 'bg-white border-neutral-200 hover:border-orange-300 shadow-sm'
                    : 'bg-neutral-900/50 border-neutral-800 hover:border-orange-500/30'
            )}
        >
            <div
                className={cn(
                    'w-10 h-10 rounded-xl flex items-center justify-center',
                    'border transition-colors',
                    isLight
                        ? 'bg-neutral-100 border-neutral-200'
                        : 'bg-neutral-800 border-neutral-700',
                    'group-hover:border-orange-500/30'
                )}
                aria-hidden="true"
            >
                <Icon
                    size={20}
                    className={cn(
                        'transition-colors',
                        isLight ? 'text-neutral-600' : 'text-neutral-400',
                        'group-hover:' + color
                    )}
                />
            </div>

            <span
                className={cn(
                    'text-[10px] font-bold uppercase tracking-widest',
                    isLight ? 'text-neutral-500' : 'text-neutral-500'
                )}
            >
                {label}
            </span>

            <div className="flex items-baseline gap-1">
                <span className={cn('text-xl font-bold', isLight ? 'text-neutral-900' : 'text-white')}>
                    {value}
                </span>
                <span
                    className={cn(
                        'text-xs font-mono',
                        modifier >= 0 ? 'text-green-500' : 'text-red-500'
                    )}
                    title={`Модификатор: ${modifierText}`}
                >
                    {modifierText}
                </span>
            </div>
        </div>
    )
}

interface StatusBadgeProps {
    name: string
    status: { type: 'buff' | 'debuff' | 'neutral'; description: string; duration?: number }
    isLight: boolean
}

const StatusBadge: React.FC<StatusBadgeProps> = ({ name, status, isLight }) => {
    const colors = STATUS_TYPE_COLORS[status.type]

    return (
        <div
            className={cn(
                'px-3 py-1.5 rounded-lg flex items-center gap-2 border group relative',
                colors.bg,
                colors.border,
                colors.text
            )}
            title={status.description}
        >
            <div className={cn('w-1 h-1 rounded-full', colors.text.replace('text-', 'bg-'))} aria-hidden="true" />
            <span className="text-[10px] font-bold uppercase tracking-widest">{name}</span>

            {status.duration !== undefined && status.duration !== -1 && (
                <div className="flex items-center gap-1">
                    <Clock size={10} className="opacity-50" />
                    <span className="text-[9px] font-mono opacity-70">{status.duration}</span>
                </div>
            )}

            {/* Tooltip при ховере */}
            <div
                className={cn(
                    'absolute bottom-full left-1/2 -translate-x-1/2 mb-2',
                    'px-3 py-2 rounded-lg text-xs max-w-xs',
                    'opacity-0 group-hover:opacity-100 transition-opacity',
                    'pointer-events-none z-10 whitespace-normal',
                    isLight ? 'bg-neutral-900 text-white' : 'bg-white text-neutral-900'
                )}
            >
                {status.description}
            </div>
        </div>
    )
}

interface MutationBadgeProps {
    name: string
    mutation: { type: 'beneficial' | 'detrimental' | 'neutral'; description: string; visible: boolean }
    isLight: boolean
}

const MutationBadge: React.FC<MutationBadgeProps> = ({ name, mutation, isLight }) => {
    const colors = MUTATION_TYPE_COLORS[mutation.type]
    const Icon = mutation.type === 'beneficial' ? TrendingUp : mutation.type === 'detrimental' ? TrendingDown : Star

    return (
        <div
            className={cn(
                'px-3 py-1.5 rounded-lg flex items-center gap-2 border group relative',
                colors.bg,
                colors.border,
                colors.text
            )}
            title={mutation.description}
        >
            <Icon size={12} className="shrink-0" aria-hidden="true" />
            <span className="text-[10px] font-bold uppercase tracking-widest">{name}</span>

            {/* Tooltip */}
            <div
                className={cn(
                    'absolute bottom-full left-1/2 -translate-x-1/2 mb-2',
                    'px-3 py-2 rounded-lg text-xs max-w-xs',
                    'opacity-0 group-hover:opacity-100 transition-opacity',
                    'pointer-events-none z-10 whitespace-normal',
                    isLight ? 'bg-neutral-900 text-white' : 'bg-white text-neutral-900'
                )}
            >
                {mutation.description}
            </div>
        </div>
    )
}

// ─── Основной компонент ───────────────────────────────────────────────────────

export const StateTab: React.FC<StateTabProps> = ({ me, appSettings }) => {
    const isLight = appSettings?.theme === 'light'

    // Парсинг JSONB полей
    const statuses = useMemo(() => {
        if (!me?.statuses || typeof me.statuses !== 'object') return {}
        return me.statuses as CharacterStatuses
    }, [me?.statuses])

    const mutations = useMemo(() => {
        if (!me?.mutations || typeof me.mutations !== 'object') return {}
        return me.mutations as CharacterMutations
    }, [me?.mutations])

    const statusEntries = Object.entries(statuses)
    const mutationEntries = Object.entries(mutations)

    return (
        <div
            className={cn(
                'flex-1 flex flex-col min-h-0 overflow-hidden',
                isLight ? 'bg-neutral-50' : 'bg-black'
            )}
        >
            {/* Заголовок */}
            <header
                className={cn(
                    'p-6 border-b flex items-center justify-between',
                    isLight ? 'border-neutral-200' : 'border-neutral-800/50'
                )}
            >
                <div className="flex items-center gap-3">
                    <div
                        className={cn(
                            'w-10 h-10 rounded-xl flex items-center justify-center border',
                            isLight
                                ? 'bg-orange-100 border-orange-200'
                                : 'bg-orange-500/10 border-orange-500/20'
                        )}
                        aria-hidden="true"
                    >
                        <Activity
                            className={isLight ? 'text-orange-600' : 'text-orange-500'}
                            size={24}
                        />
                    </div>

                    <div>
                        <h3
                            className={cn(
                                'text-lg font-bold font-display uppercase tracking-wider',
                                isLight ? 'text-neutral-900' : 'text-white'
                            )}
                        >
                            Состояние
                        </h3>
                        <p
                            className={cn(
                                'text-xs uppercase tracking-widest font-medium',
                                isLight ? 'text-neutral-500' : 'text-neutral-500'
                            )}
                        >
                            Характеристики и эффекты
                        </p>
                    </div>
                </div>

                {/* Выравнивание */}
                {me?.alignment && (
                    <div
                        className={cn(
                            'px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border',
                            isLight
                                ? 'bg-neutral-100 border-neutral-200 text-neutral-600'
                                : 'bg-neutral-900 border-neutral-700 text-neutral-400'
                        )}
                        title="Мировоззрение"
                    >
                        {me.alignment.replace('_', ' ')}
                    </div>
                )}
            </header>

            <div className="flex-1 overflow-y-auto p-6 space-y-8">
                {!me ? (
                    <div
                        className="h-full flex flex-col items-center justify-center text-center space-y-4 opacity-40"
                        role="status"
                    >
                        <div
                            className={cn(
                                'w-20 h-20 rounded-full flex items-center justify-center border',
                                isLight
                                    ? 'bg-neutral-100 border-neutral-200'
                                    : 'bg-neutral-900 border-neutral-800'
                            )}
                            aria-hidden="true"
                        >
                            <User
                                size={40}
                                className={isLight ? 'text-neutral-400' : 'text-neutral-600'}
                            />
                        </div>
                        <p className={cn('font-medium italic', isLight ? 'text-neutral-400' : 'text-neutral-500')}>
                            Данные персонажа не найдены...
                        </p>
                    </div>
                ) : (
                    <>
                        {/* Показатели здоровья */}
                        <section
                            className={cn(
                                'space-y-6 p-6 rounded-2xl border',
                                isLight
                                    ? 'bg-white border-neutral-200 shadow-sm'
                                    : 'bg-neutral-900/30 border-neutral-800/50'
                            )}
                            aria-label="Показатели здоровья"
                        >
                            <ProgressBar
                                current={me.hp}
                                max={me.hp_max}
                                color="bg-gradient-to-r from-red-600 to-red-500"
                                label="Здоровье (HP)"
                                icon={Heart}
                                isLight={isLight}
                                showWarning
                            />

                            <ProgressBar
                                current={me.mana}
                                max={me.mana_max}
                                color="bg-gradient-to-r from-blue-600 to-blue-500"
                                label="Мана (MP)"
                                icon={Zap}
                                isLight={isLight}
                            />

                            <ProgressBar
                                current={me.stress}
                                max={me.stress_max}
                                color="bg-gradient-to-r from-purple-600 to-purple-500"
                                label="Стресс"
                                icon={AlertCircle}
                                isLight={isLight}
                                showWarning
                            />
                        </section>

                        {/* Основные характеристики */}
                        <section className="space-y-4" aria-label="Основные характеристики">
                            <h4
                                className={cn(
                                    'text-[10px] font-bold uppercase tracking-[0.3em] ml-1',
                                    isLight ? 'text-neutral-500' : 'text-neutral-600'
                                )}
                            >
                                Основные характеристики
                            </h4>

                            <div className="grid grid-cols-3 gap-3">
                                {STATS_CONFIG.map((stat) => (
                                    <StatCard
                                        key={stat.key}
                                        label={stat.label}
                                        value={me[`stat_${stat.key}` as keyof Player] as number || 10}
                                        icon={stat.icon}
                                        color={stat.color}
                                        isLight={isLight}
                                    />
                                ))}
                            </div>
                        </section>

                        {/* Активные состояния */}
                        <section className="space-y-3" aria-label="Активные состояния">
                            <h4
                                className={cn(
                                    'text-[10px] font-bold uppercase tracking-[0.3em] ml-1',
                                    isLight ? 'text-neutral-500' : 'text-neutral-600'
                                )}
                            >
                                Активные состояния
                            </h4>

                            <div className="flex flex-wrap gap-2">
                                {statusEntries.length === 0 ? (
                                    <div
                                        className={cn(
                                            'w-full p-4 rounded-xl border border-dashed',
                                            'flex items-center justify-center gap-2 opacity-30',
                                            isLight ? 'border-neutral-300' : 'border-neutral-800'
                                        )}
                                    >
                                        <span
                                            className={cn(
                                                'text-[10px] font-bold uppercase tracking-widest',
                                                isLight ? 'text-neutral-400' : 'text-neutral-500'
                                            )}
                                        >
                                            Нет активных эффектов
                                        </span>
                                    </div>
                                ) : (
                                    statusEntries.map(([name, status]) => (
                                        <StatusBadge
                                            key={name}
                                            name={name}
                                            status={status}
                                            isLight={isLight}
                                        />
                                    ))
                                )}
                            </div>
                        </section>

                        {/* Мутации */}
                        <section className="space-y-3" aria-label="Мутации и особенности">
                            <h4
                                className={cn(
                                    'text-[10px] font-bold uppercase tracking-[0.3em] ml-1',
                                    isLight ? 'text-neutral-500' : 'text-neutral-600'
                                )}
                            >
                                Мутации и особенности
                            </h4>

                            <div className="flex flex-wrap gap-2">
                                {mutationEntries.length === 0 ? (
                                    <div
                                        className={cn(
                                            'w-full p-4 rounded-xl border border-dashed',
                                            'flex items-center justify-center gap-2 opacity-30',
                                            isLight ? 'border-neutral-300' : 'border-neutral-800'
                                        )}
                                    >
                                        <span
                                            className={cn(
                                                'text-[10px] font-bold uppercase tracking-widest',
                                                isLight ? 'text-neutral-400' : 'text-neutral-500'
                                            )}
                                        >
                                            Чистая ДНК
                                        </span>
                                    </div>
                                ) : (
                                    mutationEntries.map(([name, mutation]) => (
                                        <MutationBadge
                                            key={name}
                                            name={name}
                                            mutation={mutation}
                                            isLight={isLight}
                                        />
                                    ))
                                )}
                            </div>
                        </section>
                    </>
                )}
            </div>
        </div>
    )
}

StateTab.displayName = 'StateTab'