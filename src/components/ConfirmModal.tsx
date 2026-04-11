// src/components/ui/ConfirmModal.tsx

import React, { useEffect, useCallback, useRef } from 'react'
import { AlertTriangle, Info, HelpCircle } from 'lucide-react'
import { cn } from '@/src/lib/utils'
import type { AppSettings } from '@/src/types'

// ─── Типы ─────────────────────────────────────────────────────────────────────

export interface ConfirmModalProps {
    /**
     * Показывать модалку
     */
    isOpen: boolean

    /**
     * Заголовок
     */
    title: string

    /**
     * Текст описания
     */
    message: string

    /**
     * Тип действия — определяет цвет кнопки подтверждения
     * @default 'danger'
     */
    variant?: 'danger' | 'warning' | 'info'

    /**
     * Текст кнопки подтверждения
     * @default 'Подтвердить'
     */
    confirmText?: string

    /**
     * Текст кнопки отмены
     * @default 'Отмена'
     */
    cancelText?: string

    /**
     * Callback подтверждения
     */
    onConfirm: () => void

    /**
     * Callback отмены
     */
    onCancel: () => void

    /**
     * Закрыть по клику вне модалки
     * @default true
     */
    closeOnBackdropClick?: boolean

    /**
     * Закрыть по Escape
     * @default true
     */
    closeOnEscape?: boolean

    /**
     * Настройки темы
     */
    appSettings?: AppSettings
}

// ─── Утилиты ──────────────────────────────────────────────────────────────────

/**
 * Блокировка скролла body
 */
function useLockBodyScroll(lock: boolean) {
    useEffect(() => {
        if (!lock) return

        const originalOverflow = document.body.style.overflow
        const originalPaddingRight = document.body.style.paddingRight

        // Измеряем ширину скроллбара
        const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth

        // Блокируем скролл и компенсируем ширину скроллбара
        document.body.style.overflow = 'hidden'
        document.body.style.paddingRight = `${scrollbarWidth}px`

        return () => {
            document.body.style.overflow = originalOverflow
            document.body.style.paddingRight = originalPaddingRight
        }
    }, [lock])
}

/**
 * Фокус-трап внутри модалки
 */
function useFocusTrap(enabled: boolean, containerRef: React.RefObject<HTMLDivElement>) {
    useEffect(() => {
        if (!enabled || !containerRef.current) return

        const container = containerRef.current

        // Сохраняем элемент который был в фокусе до открытия модалки
        const previousActiveElement = document.activeElement as HTMLElement

        // Фокусируем первую кнопку в модалке
        const firstButton = container.querySelector('button') as HTMLButtonElement
        firstButton?.focus()

        // Обработчик Tab — держим фокус внутри модалки
        const handleTab = (e: KeyboardEvent) => {
            if (e.key !== 'Tab') return

            const focusableElements = container.querySelectorAll<HTMLElement>(
                'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
            )

            const firstFocusable = focusableElements[0]
            const lastFocusable = focusableElements[focusableElements.length - 1]

            if (e.shiftKey) {
                // Shift+Tab на первом элементе → переход на последний
                if (document.activeElement === firstFocusable) {
                    e.preventDefault()
                    lastFocusable?.focus()
                }
            } else {
                // Tab на последнем элементе → переход на первый
                if (document.activeElement === lastFocusable) {
                    e.preventDefault()
                    firstFocusable?.focus()
                }
            }
        }

        document.addEventListener('keydown', handleTab)

        return () => {
            document.removeEventListener('keydown', handleTab)
            // Возвращаем фокус обратно
            previousActiveElement?.focus()
        }
    }, [enabled, containerRef])
}

// ─── Компонент ────────────────────────────────────────────────────────────────

export const ConfirmModal: React.FC<ConfirmModalProps> = ({
    isOpen,
    title,
    message,
    variant = 'danger',
    confirmText = 'Подтвердить',
    cancelText = 'Отмена',
    onConfirm,
    onCancel,
    closeOnBackdropClick = true,
    closeOnEscape = true,
    appSettings,
}) => {
    const isLight = appSettings?.theme === 'light'
    const containerRef = useRef<HTMLDivElement>(null)

    // Блокировка скролла
    useLockBodyScroll(isOpen)

    // Фокус-трап
    useFocusTrap(isOpen, containerRef)

    // Закрытие по Escape
    const handleEscape = useCallback(
        (e: KeyboardEvent) => {
            if (closeOnEscape && e.key === 'Escape') {
                onCancel()
            }
        },
        [closeOnEscape, onCancel]
    )

    useEffect(() => {
        if (!isOpen) return

        document.addEventListener('keydown', handleEscape)
        return () => document.removeEventListener('keydown', handleEscape)
    }, [isOpen, handleEscape])

    // Клик по backdrop
    const handleBackdropClick = useCallback(
        (e: React.MouseEvent<HTMLDivElement>) => {
            if (closeOnBackdropClick && e.target === e.currentTarget) {
                onCancel()
            }
        },
        [closeOnBackdropClick, onCancel]
    )

    // Цвета кнопки подтверждения в зависимости от варианта
    const confirmButtonClass = (() => {
        switch (variant) {
            case 'danger':
                return 'bg-red-600 hover:bg-red-500 focus:ring-red-500 text-white'
            case 'warning':
                return 'bg-orange-600 hover:bg-orange-500 focus:ring-orange-500 text-white'
            case 'info':
                return 'bg-blue-600 hover:bg-blue-500 focus:ring-blue-500 text-white'
        }
    })()

    // Иконка в зависимости от варианта
    const Icon = (() => {
        switch (variant) {
            case 'danger':
                return AlertTriangle
            case 'warning':
                return AlertTriangle
            case 'info':
                return Info
        }
    })()

    const iconColor = (() => {
        switch (variant) {
            case 'danger':
                return 'text-red-500'
            case 'warning':
                return 'text-orange-500'
            case 'info':
                return 'text-blue-500'
        }
    })()

    if (!isOpen) return null

    return (
        // Backdrop
        <div
            className={cn(
                'fixed inset-0 z-50 flex items-center justify-center p-6',
                'bg-black/80 backdrop-blur-sm',
                'animate-in fade-in duration-200'
            )}
            onClick={handleBackdropClick}
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirm-modal-title"
            aria-describedby="confirm-modal-description"
        >
            {/* Контейнер модалки */}
            <div
                ref={containerRef}
                className={cn(
                    'w-full max-w-sm border rounded-3xl p-6 shadow-2xl',
                    'animate-in zoom-in-95 duration-200',
                    isLight
                        ? 'bg-white border-neutral-200'
                        : 'bg-neutral-900 border-neutral-800'
                )}
                onClick={(e) => e.stopPropagation()}
                role="document"
            >
                {/* Иконка */}
                <div className="flex justify-center mb-4">
                    <div
                        className={cn(
                            'w-12 h-12 rounded-full flex items-center justify-center',
                            variant === 'danger'
                                ? 'bg-red-500/10'
                                : variant === 'warning'
                                    ? 'bg-orange-500/10'
                                    : 'bg-blue-500/10'
                        )}
                        aria-hidden="true"
                    >
                        <Icon size={24} className={iconColor} />
                    </div>
                </div>

                {/* Заголовок */}
                <h3
                    id="confirm-modal-title"
                    className={cn(
                        'text-lg font-bold text-center mb-3',
                        isLight ? 'text-neutral-900' : 'text-white'
                    )}
                >
                    {title}
                </h3>

                {/* Сообщение */}
                <p
                    id="confirm-modal-description"
                    className={cn(
                        'text-sm text-center mb-6',
                        isLight ? 'text-neutral-600' : 'text-neutral-400'
                    )}
                >
                    {message}
                </p>

                {/* Кнопки */}
                <div className="flex gap-3">
                    {/* Отмена */}
                    <button
                        type="button"
                        onClick={onCancel}
                        className={cn(
                            'flex-1 py-3 text-sm font-bold rounded-xl',
                            'transition-colors',
                            'focus:outline-none focus:ring-2 focus:ring-offset-2',
                            isLight
                                ? [
                                    'bg-neutral-100 text-neutral-700',
                                    'hover:bg-neutral-200',
                                    'focus:ring-neutral-400',
                                  ].join(' ')
                                : [
                                    'bg-neutral-800 text-neutral-300',
                                    'hover:bg-neutral-700',
                                    'focus:ring-neutral-600',
                                  ].join(' ')
                        )}
                    >
                        {cancelText}
                    </button>

                    {/* Подтверждение */}
                    <button
                        type="button"
                        onClick={onConfirm}
                        className={cn(
                            'flex-1 py-3 text-sm font-bold rounded-xl',
                            'transition-colors',
                            'focus:outline-none focus:ring-2 focus:ring-offset-2',
                            confirmButtonClass
                        )}
                    >
                        {confirmText}
                    </button>
                </div>
            </div>
        </div>
    )
}

ConfirmModal.displayName = 'ConfirmModal'