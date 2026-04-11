// src/components/room/DiceOverlay.tsx

import React, { useEffect, useCallback } from 'react'
import { cn } from '@/src/lib/utils'
import type { AppSettings } from '@/src/types'

// ─── Типы ─────────────────────────────────────────────────────────────────────

export interface DiceRollResult {
    player: string          // имя игрока
    playerUid?: string      // uid для цвета
    notation: string        // "1d20", "2d6+3" etc
    value: number           // итоговый результат
    breakdown?: number[]    // результаты каждого кубика [15, 3]
    modifier?: number       // модификатор (+3, -1)
    isCriticalHit?: boolean
    isCriticalFail?: boolean
    advantage?: boolean
    disadvantage?: boolean
}

interface DiceOverlayProps {
    showDiceRoll: DiceRollResult | null
    onClose?: () => void
    appSettings?: AppSettings
}

// ─── Константы ────────────────────────────────────────────────────────────────

// Маппинг нотации к количеству граней для отрисовки SVG
const DICE_FACES: Record<string, number> = {
    d4: 4,
    d6: 6,
    d8: 8,
    d10: 10,
    d12: 12,
    d20: 20,
    d100: 100,
}

// ─── SVG кубики ───────────────────────────────────────────────────────────────

interface DiceSvgProps {
    sides: number
    value: number
    isCriticalHit?: boolean
    isCriticalFail?: boolean
    className?: string
}

/**
 * SVG иконка кубика с результатом внутри
 */
const DiceSvg: React.FC<DiceSvgProps> = ({
    sides,
    value,
    isCriticalHit,
    isCriticalFail,
    className,
}) => {
    const color = isCriticalHit
        ? '#f97316'  // orange-500
        : isCriticalFail
            ? '#ef4444'  // red-500
            : '#a78bfa'  // violet-400

    const strokeColor = isCriticalHit
        ? '#ea580c'
        : isCriticalFail
            ? '#dc2626'
            : '#7c3aed'

    // d20 — треугольник (икосаэдр вид сверху)
    if (sides === 20) {
        return (
            <svg
                viewBox="0 0 100 100"
                className={cn('w-28 h-28', className)}
                aria-hidden="true"
            >
                <polygon
                    points="50,5 95,80 5,80"
                    fill={color}
                    stroke={strokeColor}
                    strokeWidth="3"
                />
                <polygon
                    points="50,20 80,70 20,70"
                    fill="none"
                    stroke={strokeColor}
                    strokeWidth="1.5"
                    opacity="0.5"
                />
                <text
                    x="50"
                    y="65"
                    textAnchor="middle"
                    fill="white"
                    fontSize="24"
                    fontWeight="bold"
                    fontFamily="monospace"
                >
                    {value}
                </text>
            </svg>
        )
    }

    // d6 — квадрат
    if (sides === 6) {
        return (
            <svg
                viewBox="0 0 100 100"
                className={cn('w-28 h-28', className)}
                aria-hidden="true"
            >
                <rect
                    x="10"
                    y="10"
                    width="80"
                    height="80"
                    rx="12"
                    fill={color}
                    stroke={strokeColor}
                    strokeWidth="3"
                />
                <text
                    x="50"
                    y="62"
                    textAnchor="middle"
                    fill="white"
                    fontSize="32"
                    fontWeight="bold"
                    fontFamily="monospace"
                >
                    {value}
                </text>
            </svg>
        )
    }

    // d4 — треугольник острый
    if (sides === 4) {
        return (
            <svg
                viewBox="0 0 100 100"
                className={cn('w-28 h-28', className)}
                aria-hidden="true"
            >
                <polygon
                    points="50,5 95,90 5,90"
                    fill={color}
                    stroke={strokeColor}
                    strokeWidth="3"
                />
                <text
                    x="50"
                    y="80"
                    textAnchor="middle"
                    fill="white"
                    fontSize="24"
                    fontWeight="bold"
                    fontFamily="monospace"
                >
                    {value}
                </text>
            </svg>
        )
    }

    // d8, d10, d12, d100 — ромб (универсальная форма)
    return (
        <svg
            viewBox="0 0 100 100"
            className={cn('w-28 h-28', className)}
            aria-hidden="true"
        >
            <polygon
                points="50,5 95,50 50,95 5,50"
                fill={color}
                stroke={strokeColor}
                strokeWidth="3"
            />
            <text
                x="50"
                y="57"
                textAnchor="middle"
                fill="white"
                fontSize={value >= 100 ? '18' : '24'}
                fontWeight="bold"
                fontFamily="monospace"
            >
                {value}
            </text>
        </svg>
    )
}

// ─── Утилиты ──────────────────────────────────────────────────────────────────

/**
 * Извлекаем тип кубика из нотации "2d6+3" → d6
 */
function parseDiceType(notation: string): number {
    const match = notation.match(/d(\d+)/i)
    return match ? parseInt(match[1], 10) : 20
}

/**
 * Форматируем breakdowns "15, 3 → 18"
 */
function formatBreakdown(breakdown: number[], modifier?: number): string {
    const diceSum = breakdown.join(' + ')
    const modStr = modifier
        ? modifier > 0 ? ` + ${modifier}` : ` − ${Math.abs(modifier)}`
        : ''
    return `${diceSum}${modStr}`
}

/**
 * Лейбл результата
 */
function getResultLabel(roll: DiceRollResult): string {
    if (roll.isCriticalHit) return '🎯 Критическое попадание!'
    if (roll.isCriticalFail) return '💀 Критический провал!'
    if (roll.advantage) return '⬆️ С преимуществом'
    if (roll.disadvantage) return '⬇️ С помехой'
    return ''
}

// ─── Основной компонент ───────────────────────────────────────────────────────

export const DiceOverlay: React.FC<DiceOverlayProps> = ({
    showDiceRoll,
    onClose,
    appSettings,
}) => {
    const isLight = appSettings?.theme === 'light'

    // Закрытие по Escape
    const handleKeyDown = useCallback((e: KeyboardEvent) => {
        if (e.key === 'Escape') {
            onClose?.()
        }
    }, [onClose])

    useEffect(() => {
        if (!showDiceRoll) return

        document.addEventListener('keydown', handleKeyDown)
        return () => document.removeEventListener('keydown', handleKeyDown)
    }, [showDiceRoll, handleKeyDown])

    if (!showDiceRoll) return null

    const diceSides = parseDiceType(showDiceRoll.notation)
    const resultLabel = getResultLabel(showDiceRoll)
    const isCrit = showDiceRoll.isCriticalHit
    const isFail = showDiceRoll.isCriticalFail

    return (
        // Backdrop
        <div
            className={cn(
                'fixed inset-0 z-50 flex items-center justify-center',
                'bg-black/60 backdrop-blur-sm',
                'animate-in fade-in duration-200'
            )}
            onClick={onClose}
            role="dialog"
            aria-modal="true"
            aria-label={`Бросок кубика: ${showDiceRoll.notation}`}
        >
            {/* Карточка — клик не закрывает */}
            <div
                className={cn(
                    'relative flex flex-col items-center gap-4',
                    'p-8 rounded-2xl border shadow-2xl',
                    'animate-in zoom-in-95 duration-200',
                    'min-w-[280px] max-w-sm mx-4',
                    isLight
                        ? 'bg-white border-neutral-200 text-neutral-900'
                        : 'bg-neutral-900 border-neutral-700 text-white',
                    // Специальная рамка для крита/провала
                    isCrit && 'border-orange-500/50 shadow-orange-500/20',
                    isFail && 'border-red-500/50 shadow-red-500/20',
                )}
                onClick={(e) => e.stopPropagation()}
                role="document"
            >
                {/* Кнопка закрытия */}
                {onClose && (
                    <button
                        onClick={onClose}
                        className={cn(
                            'absolute top-3 right-3 w-7 h-7',
                            'flex items-center justify-center',
                            'rounded-full text-lg leading-none',
                            'transition-colors',
                            isLight
                                ? 'text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600'
                                : 'text-neutral-500 hover:bg-neutral-800 hover:text-neutral-300'
                        )}
                        aria-label="Закрыть"
                    >
                        ×
                    </button>
                )}

                {/* Заголовок */}
                <h3
                    className={cn(
                        'text-sm font-bold uppercase tracking-widest',
                        isLight ? 'text-neutral-500' : 'text-neutral-400'
                    )}
                >
                    Бросок кубика
                </h3>

                {/* Нотация */}
                <div
                    className={cn(
                        'px-3 py-1 rounded-full text-xs font-mono font-bold',
                        'border uppercase tracking-wider',
                        isLight
                            ? 'bg-violet-50 border-violet-200 text-violet-600'
                            : 'bg-violet-900/30 border-violet-700/50 text-violet-400'
                    )}
                    aria-label={`Тип броска: ${showDiceRoll.notation}`}
                >
                    {showDiceRoll.notation.toUpperCase()}
                </div>

                {/* SVG кубик с анимацией */}
                <div
                    className={cn(
                        'animate-in zoom-in spin-in-180 duration-500',
                        // Пульсация для критического результата
                        isCrit && 'animate-pulse',
                    )}
                    aria-hidden="true"
                >
                    <DiceSvg
                        sides={diceSides}
                        value={showDiceRoll.value}
                        isCriticalHit={showDiceRoll.isCriticalHit}
                        isCriticalFail={showDiceRoll.isCriticalFail}
                    />
                </div>

                {/* Результат */}
                <div className="text-center">
                    <div
                        className={cn(
                            'text-5xl font-black tabular-nums',
                            isCrit
                                ? 'text-orange-500'
                                : isFail
                                    ? 'text-red-500'
                                    : isLight
                                        ? 'text-neutral-900'
                                        : 'text-white'
                        )}
                        aria-label={`Результат: ${showDiceRoll.value}`}
                    >
                        {showDiceRoll.value}
                    </div>

                    {/* Расшифровка бросков */}
                    {showDiceRoll.breakdown && showDiceRoll.breakdown.length > 1 && (
                        <div
                            className={cn(
                                'text-xs font-mono mt-1',
                                isLight ? 'text-neutral-400' : 'text-neutral-500'
                            )}
                            aria-label={`Из бросков: ${showDiceRoll.breakdown.join(', ')}`}
                        >
                            ({formatBreakdown(showDiceRoll.breakdown, showDiceRoll.modifier)})
                        </div>
                    )}
                </div>

                {/* Лейбл критического результата */}
                {resultLabel && (
                    <div
                        className={cn(
                            'text-sm font-bold px-4 py-2 rounded-xl',
                            isCrit
                                ? 'bg-orange-500/10 text-orange-500'
                                : isFail
                                    ? 'bg-red-500/10 text-red-500'
                                    : isLight
                                        ? 'bg-neutral-100 text-neutral-600'
                                        : 'bg-neutral-800 text-neutral-300'
                        )}
                        role="status"
                        aria-live="assertive"
                    >
                        {resultLabel}
                    </div>
                )}

                {/* Имя игрока */}
                <div
                    className={cn(
                        'text-sm border-t pt-3 w-full text-center',
                        isLight
                            ? 'text-neutral-500 border-neutral-100'
                            : 'text-neutral-400 border-neutral-800'
                    )}
                >
                    <span
                        className={cn(
                            'font-bold',
                            isLight ? 'text-neutral-700' : 'text-neutral-200'
                        )}
                    >
                        {showDiceRoll.player}
                    </span>
                    {' '}бросил кубик
                </div>

                {/* Подсказка закрытия */}
                <p
                    className={cn(
                        'text-xs',
                        isLight ? 'text-neutral-400' : 'text-neutral-600'
                    )}
                    aria-hidden="true"
                >
                    Нажмите Esc или кликните вне карточки
                </p>
            </div>
        </div>
    )
}

DiceOverlay.displayName = 'DiceOverlay'