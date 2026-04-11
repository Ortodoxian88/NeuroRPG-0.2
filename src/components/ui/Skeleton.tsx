// src/components/ui/Skeleton.tsx

import React from 'react'
import { cn } from '@/src/lib/utils'

// ─── Типы ─────────────────────────────────────────────────────────────────────

export interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
    /**
     * Форма скелетона
     * @default 'rectangle'
     */
    variant?: 'rectangle' | 'circle' | 'text' | 'avatar'

    /**
     * Размер (для circle/avatar)
     * @default 'md'
     */
    size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl'

    /**
     * Скорость анимации
     * @default 'normal'
     */
    speed?: 'slow' | 'normal' | 'fast'

    /**
     * Светлая тема
     * @default false
     */
    isLight?: boolean

    /**
     * Отключить анимацию
     * @default false
     */
    disableAnimation?: boolean
}

// ─── Константы ────────────────────────────────────────────────────────────────

const CIRCLE_SIZES = {
    xs: 'w-6 h-6',
    sm: 'w-8 h-8',
    md: 'w-12 h-12',
    lg: 'w-16 h-16',
    xl: 'w-24 h-24',
}

const TEXT_HEIGHTS = {
    xs: 'h-3',
    sm: 'h-4',
    md: 'h-5',
    lg: 'h-6',
    xl: 'h-8',
}

// ─── Компонент ────────────────────────────────────────────────────────────────

export const Skeleton = React.forwardRef<HTMLDivElement, SkeletonProps>(
    (
        {
            variant = 'rectangle',
            size = 'md',
            speed = 'normal',
            isLight = false,
            disableAnimation = false,
            className,
            ...props
        },
        ref
    ) => {
        // Базовый цвет фона в зависимости от темы
        const baseColor = isLight
            ? 'bg-neutral-200/60'
            : 'bg-neutral-800/50'

        // Анимация пульсации
        const animationClass = disableAnimation
            ? ''
            : speed === 'slow'
                ? 'animate-pulse [animation-duration:2s]'
                : speed === 'fast'
                    ? 'animate-pulse [animation-duration:0.8s]'
                    : 'animate-pulse' // normal: default 1s

        // Классы в зависимости от варианта
        const variantClasses = (() => {
            switch (variant) {
                case 'circle':
                case 'avatar':
                    return cn(
                        'rounded-full',
                        CIRCLE_SIZES[size]
                    )

                case 'text':
                    return cn(
                        'rounded',
                        TEXT_HEIGHTS[size],
                        'w-full'
                    )

                case 'rectangle':
                default:
                    return 'rounded-lg'
            }
        })()

        return (
            <div
                ref={ref}
                role="status"
                aria-label="Загрузка..."
                aria-busy="true"
                className={cn(
                    baseColor,
                    animationClass,
                    variantClasses,
                    className
                )}
                {...props}
            >
                {/* Скрытый текст для скринридеров */}
                <span className="sr-only">Загрузка...</span>
            </div>
        )
    }
)

Skeleton.displayName = 'Skeleton'

// ─── Предустановленные варианты ───────────────────────────────────────────────

/**
 * Скелетон карточки персонажа
 */
export const SkeletonCard: React.FC<{ isLight?: boolean }> = ({ isLight }) => (
    <div className={cn('p-4 rounded-2xl border', isLight ? 'bg-white border-neutral-200' : 'bg-neutral-900 border-neutral-800')}>
        <div className="flex items-center gap-4">
            <Skeleton variant="avatar" size="lg" isLight={isLight} />
            <div className="flex-1 space-y-2">
                <Skeleton variant="text" size="md" isLight={isLight} className="w-3/4" />
                <Skeleton variant="text" size="sm" isLight={isLight} className="w-1/2" />
            </div>
        </div>
        <div className="mt-4 space-y-2">
            <Skeleton variant="text" size="sm" isLight={isLight} />
            <Skeleton variant="text" size="sm" isLight={isLight} className="w-5/6" />
        </div>
    </div>
)

SkeletonCard.displayName = 'SkeletonCard'

/**
 * Скелетон сообщения в чате
 */
export const SkeletonMessage: React.FC<{ isLight?: boolean }> = ({ isLight }) => (
    <div className={cn('p-4 rounded-2xl border', isLight ? 'bg-white border-neutral-200' : 'bg-neutral-900 border-neutral-800')}>
        <div className="flex items-center gap-2 mb-3">
            <Skeleton variant="avatar" size="sm" isLight={isLight} />
            <Skeleton variant="text" size="sm" isLight={isLight} className="w-24" />
        </div>
        <div className="space-y-2">
            <Skeleton variant="text" size="md" isLight={isLight} />
            <Skeleton variant="text" size="md" isLight={isLight} className="w-4/5" />
            <Skeleton variant="text" size="md" isLight={isLight} className="w-3/5" />
        </div>
    </div>
)

SkeletonMessage.displayName = 'SkeletonMessage'

/**
 * Скелетон списка предметов инвентаря
 */
export const SkeletonInventoryItem: React.FC<{ isLight?: boolean }> = ({ isLight }) => (
    <div className={cn('p-4 rounded-2xl border flex items-center gap-4', isLight ? 'bg-white border-neutral-200' : 'bg-neutral-900 border-neutral-800')}>
        <Skeleton variant="circle" size="md" isLight={isLight} />
        <div className="flex-1 space-y-2">
            <Skeleton variant="text" size="md" isLight={isLight} className="w-2/3" />
            <Skeleton variant="text" size="xs" isLight={isLight} className="w-1/3" />
        </div>
    </div>
)

SkeletonInventoryItem.displayName = 'SkeletonInventoryItem'

/**
 * Скелетон таблицы
 */
export const SkeletonTable: React.FC<{ rows?: number; cols?: number; isLight?: boolean }> = ({
    rows = 5,
    cols = 4,
    isLight,
}) => (
    <div className="space-y-2">
        {/* Заголовки */}
        <div className="flex gap-4">
            {Array.from({ length: cols }).map((_, i) => (
                <Skeleton key={i} variant="text" size="sm" isLight={isLight} className="flex-1" />
            ))}
        </div>
        {/* Строки */}
        {Array.from({ length: rows }).map((_, rowIndex) => (
            <div key={rowIndex} className="flex gap-4">
                {Array.from({ length: cols }).map((_, colIndex) => (
                    <Skeleton key={colIndex} variant="text" size="md" isLight={isLight} className="flex-1" />
                ))}
            </div>
        ))}
    </div>
)

SkeletonTable.displayName = 'SkeletonTable'

/**
 * Скелетон страницы комнаты
 */
export const SkeletonRoomView: React.FC<{ isLight?: boolean }> = ({ isLight }) => (
    <div className={cn('h-screen flex flex-col', isLight ? 'bg-neutral-50' : 'bg-black')}>
        {/* Хедер */}
        <div className={cn('p-4 border-b flex items-center justify-between', isLight ? 'bg-white border-neutral-200' : 'bg-neutral-900 border-neutral-800')}>
            <div className="flex items-center gap-3">
                <Skeleton variant="circle" size="md" isLight={isLight} />
                <div className="space-y-2">
                    <Skeleton variant="text" size="md" isLight={isLight} className="w-32" />
                    <Skeleton variant="text" size="sm" isLight={isLight} className="w-24" />
                </div>
            </div>
            <Skeleton variant="rectangle" isLight={isLight} className="w-24 h-10" />
        </div>

        <div className="flex-1 flex overflow-hidden">
            {/* Чат */}
            <div className="flex-1 flex flex-col">
                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                    <SkeletonMessage isLight={isLight} />
                    <SkeletonMessage isLight={isLight} />
                    <SkeletonMessage isLight={isLight} />
                </div>
                {/* Поле ввода */}
                <div className={cn('p-4 border-t', isLight ? 'bg-white border-neutral-200' : 'bg-neutral-900 border-neutral-800')}>
                    <Skeleton variant="rectangle" isLight={isLight} className="h-14" />
                </div>
            </div>

            {/* Боковая панель */}
            <div className={cn('w-80 border-l p-4 space-y-3', isLight ? 'bg-white border-neutral-200' : 'bg-neutral-900 border-neutral-800')}>
                <SkeletonCard isLight={isLight} />
                <SkeletonCard isLight={isLight} />
            </div>
        </div>
    </div>
)

SkeletonRoomView.displayName = 'SkeletonRoomView'