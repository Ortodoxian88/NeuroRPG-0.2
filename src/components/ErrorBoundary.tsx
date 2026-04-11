// src/components/ErrorBoundary.tsx

import React, { Component, ErrorInfo, ReactNode } from 'react'
import { AlertTriangle, RefreshCcw, Home, Copy, ChevronDown } from 'lucide-react'
import { cn } from '../lib/utils'

// ─── Типы ─────────────────────────────────────────────────────────────────────

interface ErrorBoundaryProps {
    children?: ReactNode
    fallback?: ReactNode
    onError?: (error: Error, errorInfo: ErrorInfo) => void
    showDetails?: boolean
    theme?: 'light' | 'dark'
}

interface ErrorBoundaryState {
    hasError: boolean
    error: Error | null
    errorInfo: ErrorInfo | null
    showStack: boolean
    copied: boolean
}

// ─── Утилиты логирования ──────────────────────────────────────────────────────

/**
 * Отправка ошибки в сервис мониторинга
 */
function logErrorToService(error: Error, errorInfo: ErrorInfo) {
    // В продакшене — отправляем в Sentry, LogRocket, или свой сервис
    if (process.env.NODE_ENV === 'production') {
        // Пример с Sentry:
        // Sentry.captureException(error, {
        //     contexts: {
        //         react: {
        //             componentStack: errorInfo.componentStack,
        //         },
        //     },
        // })

        // Или свой endpoint:
        fetch('/api/errors', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                message: error.message,
                stack: error.stack,
                componentStack: errorInfo.componentStack,
                userAgent: navigator.userAgent,
                url: window.location.href,
                timestamp: new Date().toISOString(),
                version: process.env.VITE_APP_VERSION || 'unknown',
            }),
        }).catch((err) => {
            // Фоллбэк — логируем в консоль если отправка упала
            console.error('[ErrorBoundary] Failed to send error to service:', err)
        })
    }

    // В dev — подробно логируем в консоль
    if (process.env.NODE_ENV === 'development') {
        console.group('🚨 React Error Boundary')
        console.error('Error:', error)
        console.error('Component Stack:', errorInfo.componentStack)
        console.groupEnd()
    }
}

/**
 * Санитизация текста ошибки — скрываем чувствительные данные
 */
function sanitizeErrorMessage(message: string): string {
    return message
        // Скрываем JWT токены
        .replace(/Bearer\s+[A-Za-z0-9\-_=]+\.[A-Za-z0-9\-_=]+\.?[A-Za-z0-9\-_.+/=]*/g, 'Bearer [REDACTED]')
        // Скрываем email
        .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[EMAIL]')
        // Скрываем API ключи
        .replace(/api[_-]?key[=:]\s*['"]?[A-Za-z0-9]{16,}['"]?/gi, 'api_key=[REDACTED]')
        // Скрываем пароли в URL
        .replace(/:[^:@\s]+@/g, ':[REDACTED]@')
}

// ─── Компонент ────────────────────────────────────────────────────────────────

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
    public state: ErrorBoundaryState = {
        hasError: false,
        error: null,
        errorInfo: null,
        showStack: false,
        copied: false,
    }

    public static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
        return { hasError: true, error }
    }

    public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        // Сохраняем errorInfo в state
        this.setState({ errorInfo })

        // Логируем в сервис мониторинга
        logErrorToService(error, errorInfo)

        // Вызываем callback если передан
        this.props.onError?.(error, errorInfo)
    }

    private handleReload = () => {
        // Пытаемся восстановить состояние приложения из localStorage
        // перед перезагрузкой
        try {
            const stateToPreserve = {
                lastError: this.state.error?.message,
                timestamp: Date.now(),
            }
            sessionStorage.setItem('app-recovery', JSON.stringify(stateToPreserve))
        } catch {
            // Игнорируем ошибки localStorage
        }

        window.location.reload()
    }

    private handleGoHome = () => {
        // Очищаем ошибку и переходим на главную
        this.setState({ hasError: false, error: null, errorInfo: null })
        window.location.href = '/'
    }

    private handleCopyError = async () => {
        const errorText = [
            `Error: ${this.state.error?.message}`,
            '',
            'Stack:',
            this.state.error?.stack || 'No stack trace',
            '',
            'Component Stack:',
            this.state.errorInfo?.componentStack || 'No component stack',
            '',
            `URL: ${window.location.href}`,
            `User Agent: ${navigator.userAgent}`,
            `Timestamp: ${new Date().toISOString()}`,
        ].join('\n')

        try {
            await navigator.clipboard.writeText(errorText)
            this.setState({ copied: true })
            setTimeout(() => this.setState({ copied: false }), 2000)
        } catch {
            // Fallback для старых браузеров
            const textarea = document.createElement('textarea')
            textarea.value = errorText
            textarea.style.position = 'fixed'
            textarea.style.opacity = '0'
            document.body.appendChild(textarea)
            textarea.select()
            document.execCommand('copy')
            document.body.removeChild(textarea)
            this.setState({ copied: true })
            setTimeout(() => this.setState({ copied: false }), 2000)
        }
    }

    private toggleStack = () => {
        this.setState({ showStack: !this.state.showStack })
    }

    public render() {
        if (this.state.hasError) {
            // Если передан кастомный fallback — используем его
            if (this.props.fallback) {
                return this.props.fallback
            }

            const isLight = this.props.theme === 'light'
            const isDev = process.env.NODE_ENV === 'development'
            const showDetails = this.props.showDetails ?? isDev

            const sanitizedMessage = this.state.error?.message
                ? sanitizeErrorMessage(this.state.error.message)
                : 'Неизвестная ошибка'

            return (
                <div
                    className={cn(
                        'min-h-screen flex flex-col items-center justify-center p-8',
                        'text-center space-y-6',
                        isLight ? 'bg-neutral-50' : 'bg-black'
                    )}
                    role="alert"
                    aria-live="assertive"
                >
                    {/* Иконка */}
                    <div
                        className={cn(
                            'w-20 h-20 rounded-3xl flex items-center justify-center',
                            'shadow-2xl',
                            isLight
                                ? 'bg-red-100 border border-red-200 text-red-600 shadow-red-200/50'
                                : 'bg-red-500/10 border border-red-500/20 text-red-500 shadow-red-500/10'
                        )}
                        aria-hidden="true"
                    >
                        <AlertTriangle size={40} />
                    </div>

                    {/* Заголовок */}
                    <div className="space-y-2">
                        <h1
                            className={cn(
                                'text-2xl font-bold tracking-tight',
                                isLight ? 'text-neutral-900' : 'text-white'
                            )}
                        >
                            Произошла ошибка
                        </h1>
                        <p
                            className={cn(
                                'text-sm max-w-xs mx-auto leading-relaxed',
                                isLight ? 'text-neutral-600' : 'text-neutral-500'
                            )}
                        >
                            Что-то пошло не так. Мы уже работаем над этим.
                        </p>
                    </div>

                    {/* Детали ошибки */}
                    {showDetails && this.state.error && (
                        <div
                            className={cn(
                                'w-full max-w-lg border rounded-2xl p-4 space-y-3',
                                isLight
                                    ? 'bg-white border-neutral-200'
                                    : 'bg-neutral-900/50 border-neutral-800'
                            )}
                        >
                            {/* Заголовок секции */}
                            <div className="flex items-center justify-between">
                                <p
                                    className={cn(
                                        'text-[10px] font-mono uppercase tracking-widest opacity-70',
                                        isLight ? 'text-red-600' : 'text-red-400'
                                    )}
                                >
                                    Debug Info
                                </p>

                                {/* Кнопка копирования */}
                                <button
                                    onClick={this.handleCopyError}
                                    className={cn(
                                        'text-xs px-2 py-1 rounded transition-colors',
                                        'flex items-center gap-1',
                                        isLight
                                            ? 'hover:bg-neutral-100 text-neutral-600'
                                            : 'hover:bg-neutral-800 text-neutral-400'
                                    )}
                                    title="Скопировать детали ошибки"
                                >
                                    <Copy size={12} />
                                    {this.state.copied ? 'Скопировано' : 'Копировать'}
                                </button>
                            </div>

                            {/* Сообщение ошибки */}
                            <p
                                className={cn(
                                    'text-xs font-mono text-left break-words',
                                    isLight ? 'text-neutral-700' : 'text-neutral-400'
                                )}
                            >
                                {sanitizedMessage}
                            </p>

                            {/* Stack trace (только в dev) */}
                            {isDev && this.state.error.stack && (
                                <>
                                    <button
                                        onClick={this.toggleStack}
                                        className={cn(
                                            'w-full text-left text-xs px-2 py-1 rounded',
                                            'flex items-center justify-between',
                                            'transition-colors',
                                            isLight
                                                ? 'hover:bg-neutral-100 text-neutral-600'
                                                : 'hover:bg-neutral-800 text-neutral-500'
                                        )}
                                    >
                                        Stack Trace
                                        <ChevronDown
                                            size={14}
                                            className={cn(
                                                'transition-transform',
                                                this.state.showStack && 'rotate-180'
                                            )}
                                        />
                                    </button>

                                    {this.state.showStack && (
                                        <pre
                                            className={cn(
                                                'text-[10px] font-mono text-left',
                                                'overflow-x-auto p-2 rounded',
                                                'max-h-40 overflow-y-auto',
                                                isLight
                                                    ? 'bg-neutral-100 text-neutral-700'
                                                    : 'bg-black text-neutral-400'
                                            )}
                                        >
                                            {this.state.error.stack}
                                        </pre>
                                    )}
                                </>
                            )}

                            {/* Версия приложения */}
                            {process.env.VITE_APP_VERSION && (
                                <p
                                    className={cn(
                                        'text-[10px] font-mono opacity-50',
                                        isLight ? 'text-neutral-500' : 'text-neutral-600'
                                    )}
                                >
                                    Version: {process.env.VITE_APP_VERSION}
                                </p>
                            )}
                        </div>
                    )}

                    {/* Действия */}
                    <div className="flex flex-col sm:flex-row gap-3">
                        <button
                            onClick={this.handleGoHome}
                            className={cn(
                                'flex items-center justify-center gap-2 px-6 py-3',
                                'font-bold rounded-2xl transition-all active:scale-95',
                                isLight
                                    ? 'bg-neutral-200 text-neutral-900 hover:bg-neutral-300'
                                    : 'bg-neutral-800 text-white hover:bg-neutral-700'
                            )}
                        >
                            <Home size={18} />
                            На главную
                        </button>

                        <button
                            onClick={this.handleReload}
                            className={cn(
                                'flex items-center justify-center gap-2 px-6 py-3',
                                'bg-white text-black font-bold rounded-2xl',
                                'hover:bg-neutral-200 transition-all active:scale-95'
                            )}
                        >
                            <RefreshCcw size={18} />
                            Перезагрузить
                        </button>
                    </div>

                    {/* Контакты поддержки (опционально) */}
                    <p
                        className={cn(
                            'text-xs',
                            isLight ? 'text-neutral-400' : 'text-neutral-600'
                        )}
                    >
                        Если проблема повторяется,{' '}
                        <a
                            href="mailto:support@neurorpg.com"
                            className={cn(
                                'underline',
                                isLight
                                    ? 'text-neutral-600 hover:text-neutral-900'
                                    : 'text-neutral-400 hover:text-white'
                            )}
                        >
                            свяжитесь с поддержкой
                        </a>
                    </p>
                </div>
            )
        }

        return this.props.children
    }
}

ErrorBoundary.displayName = 'ErrorBoundary'

export default ErrorBoundary