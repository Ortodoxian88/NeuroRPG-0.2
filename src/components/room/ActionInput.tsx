// src/components/room/ActionInput.tsx

import React, { useCallback, useId } from 'react'
import { Mic, Send, Command } from 'lucide-react'
import { cn } from '@/src/lib/utils'
import type { Player, AppSettings } from '@/src/types'

// ─── Типы ─────────────────────────────────────────────────────────────────────

export interface Command {
    cmd: string
    desc: string
}

export interface ActionInputProps {
    // Состояние игрока
    me?: Player
    isSpectator: boolean

    // Состояние формы
    actionInput: string
    isGenerating: boolean
    isSubmittingAction: boolean
    isRecording: boolean

    // Команды
    showCommands: boolean
    filteredCommands: Command[]

    // Обработчики
    onInputChange: (e: React.ChangeEvent<HTMLInputElement>) => void
    onCommandSelect: (cmd: string) => void
    onSubmit: (e: React.FormEvent) => void
    onVoiceInput: () => void

    // Настройки
    appSettings?: AppSettings
}

// ─── Вспомогательные компоненты ───────────────────────────────────────────────

interface GeneratingStateProps {
    isLight: boolean
}

const GeneratingState: React.FC<GeneratingStateProps> = ({ isLight }) => (
    <div
        role="status"
        aria-live="polite"
        aria-label="Гейм-мастер описывает мир"
        className={cn(
            'p-4 border-t flex items-center justify-center gap-3',
            isLight
                ? 'bg-white border-neutral-200'
                : 'bg-neutral-900/50 border-neutral-800'
        )}
    >
        {/* Анимированные точки */}
        <div className="flex gap-1" aria-hidden="true">
            <span className="w-1.5 h-1.5 bg-orange-500 rounded-full animate-bounce [animation-delay:-0.3s]" />
            <span className="w-1.5 h-1.5 bg-orange-500 rounded-full animate-bounce [animation-delay:-0.15s]" />
            <span className="w-1.5 h-1.5 bg-orange-500 rounded-full animate-bounce" />
        </div>
        <span className="text-xs font-bold uppercase tracking-widest text-neutral-500">
            Гейм-мастер описывает мир...
        </span>
    </div>
)

interface SpectatorStateProps {
    isLight: boolean
}

const SpectatorState: React.FC<SpectatorStateProps> = ({ isLight }) => (
    <div
        role="status"
        className={cn(
            'p-4 border-t text-center',
            isLight
                ? 'bg-white border-neutral-200'
                : 'bg-neutral-900/50 border-neutral-800'
        )}
    >
        <p className="text-xs font-bold uppercase tracking-widest text-neutral-600">
            Вы наблюдаете за игрой
        </p>
    </div>
)

interface CommandSuggestionsProps {
    commands: Command[]
    isLight: boolean
    onSelect: (cmd: string) => void
    inputId: string
}

const CommandSuggestions: React.FC<CommandSuggestionsProps> = ({
    commands,
    isLight,
    onSelect,
    inputId,
}) => {
    if (commands.length === 0) return null

    return (
        <div
            role="listbox"
            aria-label="Подсказки команд"
            aria-expanded="true"
            className={cn(
                'absolute bottom-full left-0 right-0 border-t',
                'animate-in slide-in-from-bottom-2 duration-200',
                isLight
                    ? 'bg-white border-neutral-200'
                    : 'bg-neutral-900 border-neutral-800'
            )}
        >
            <ul className="max-h-48 overflow-y-auto p-2 space-y-1">
                {commands.map((c) => (
                    <li key={c.cmd} role="option" aria-selected="false">
                        <button
                            type="button"
                            onClick={() => onSelect(c.cmd)}
                            className={cn(
                                'w-full flex items-center justify-between p-3 rounded-xl',
                                'transition-colors text-left group',
                                isLight
                                    ? 'hover:bg-neutral-100'
                                    : 'hover:bg-neutral-800'
                            )}
                        >
                            <div className="flex items-center gap-3">
                                <div
                                    className={cn(
                                        'w-8 h-8 rounded-lg flex items-center justify-center',
                                        'bg-orange-500/10 border border-orange-500/20'
                                    )}
                                    aria-hidden="true"
                                >
                                    <Command size={14} className="text-orange-500" />
                                </div>
                                <span className="font-mono text-sm font-bold text-orange-500">
                                    {c.cmd}
                                </span>
                            </div>
                            <span
                                className={cn(
                                    'text-xs text-neutral-500 transition-colors',
                                    isLight
                                        ? 'group-hover:text-neutral-700'
                                        : 'group-hover:text-neutral-300'
                                )}
                            >
                                {c.desc}
                            </span>
                        </button>
                    </li>
                ))}
            </ul>
        </div>
    )
}

interface VoiceButtonProps {
    isRecording: boolean
    isSupported: boolean
    onClick: () => void
}

const VoiceButton: React.FC<VoiceButtonProps> = ({
    isRecording,
    isSupported,
    onClick,
}) => {
    // Не рендерим кнопку если браузер не поддерживает Web Speech API
    if (!isSupported) return null

    return (
        <button
            type="button"
            onClick={onClick}
            aria-label={isRecording ? 'Остановить запись' : 'Голосовой ввод'}
            aria-pressed={isRecording}
            className={cn(
                'absolute right-3 top-1/2 -translate-y-1/2 p-2 rounded-xl transition-all',
                isRecording
                    ? 'text-red-500 bg-red-500/10 animate-pulse'
                    : 'text-neutral-500 hover:text-orange-500 hover:bg-orange-500/10'
            )}
        >
            <Mic size={20} aria-hidden="true" />
        </button>
    )
}

// ─── Утилиты ──────────────────────────────────────────────────────────────────

/**
 * Проверка поддержки Web Speech API
 */
function checkSpeechSupport(): boolean {
    return (
        typeof window !== 'undefined' &&
        ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window)
    )
}

/**
 * Определяем плейсхолдер для input поля
 */
function getInputPlaceholder(me: Player | undefined, isSubmitting: boolean): string {
    if (isSubmitting) return 'Отправка...'
    if (me?.isReady) return 'Ожидание других игроков...'
    return 'Что вы делаете? (напр. /roll d20)'
}

/**
 * Проверяем доступность формы для ввода
 */
function isInputDisabled(
    me: Player | undefined,
    isSubmitting: boolean,
): boolean {
    return isSubmitting || (me?.isReady ?? false)
}

// ─── Основной компонент ───────────────────────────────────────────────────────

export const ActionInput: React.FC<ActionInputProps> = ({
    onInputChange,
    actionInput,
    onSubmit,
    onVoiceInput,
    isGenerating,
    isSubmittingAction,
    showCommands,
    filteredCommands,
    onCommandSelect,
    isRecording,
    me,
    isSpectator,
    appSettings,
}) => {
    const isLight = appSettings?.theme === 'light'
    const isSpeechSupported = checkSpeechSupport()
    const inputId = useId()

    // Нельзя отправить если: нет текста, уже отправляем, игрок готов
    const cannotSubmit =
        isSubmittingAction ||
        !actionInput.trim() ||
        (me?.isReady ?? false)

    const inputDisabled = isInputDisabled(me, isSubmittingAction)
    const placeholder = getInputPlaceholder(me, isSubmittingAction)

    const handleVoiceInput = useCallback(() => {
        if (!isSpeechSupported) {
            console.warn('[ActionInput] Web Speech API не поддерживается')
            return
        }
        onVoiceInput()
    }, [isSpeechSupported, onVoiceInput])

    // ─── Состояния ────────────────────────────────────────────────────────────

    if (isGenerating) {
        return <GeneratingState isLight={isLight} />
    }

    if (isSpectator) {
        return <SpectatorState isLight={isLight} />
    }

    // ─── Основной рендер ──────────────────────────────────────────────────────

    return (
        <div
            className={cn(
                'shrink-0 border-t relative z-30',
                isLight
                    ? 'bg-white border-neutral-200'
                    : 'bg-neutral-900 border-neutral-800'
            )}
        >
            {/* Подсказки команд */}
            {showCommands && (
                <CommandSuggestions
                    commands={filteredCommands}
                    isLight={isLight}
                    onSelect={onCommandSelect}
                    inputId={inputId}
                />
            )}

            <form
                onSubmit={onSubmit}
                className="p-4 flex items-center gap-3 max-w-4xl mx-auto"
                aria-label="Форма действия игрока"
            >
                {/* Поле ввода */}
                <div className="relative flex-1 group">
                    <label htmlFor={inputId} className="sr-only">
                        Введите действие персонажа
                    </label>

                    <input
                        id={inputId}
                        type="text"
                        autoComplete="off"
                        autoCorrect="off"
                        spellCheck="false"
                        maxLength={2000}
                        className={cn(
                            'w-full py-4 rounded-2xl border transition-all outline-none',
                            'text-base font-medium',
                            // Отступ справа зависит от наличия кнопки микрофона
                            isSpeechSupported ? 'pl-4 pr-12' : 'px-4',
                            isLight
                                ? [
                                    'bg-neutral-100 border-neutral-200 text-neutral-900',
                                    'focus:bg-white focus:border-orange-500',
                                    'focus:ring-4 focus:ring-orange-500/10',
                                  ].join(' ')
                                : [
                                    'bg-black border-neutral-800 text-white',
                                    'placeholder:text-neutral-600',
                                    'focus:border-orange-500',
                                    'focus:ring-4 focus:ring-orange-500/10',
                                  ].join(' '),
                            inputDisabled && 'opacity-60 cursor-not-allowed'
                        )}
                        value={actionInput}
                        onChange={onInputChange}
                        placeholder={placeholder}
                        disabled={inputDisabled}
                        aria-autocomplete="list"
                        aria-controls={showCommands ? `${inputId}-commands` : undefined}
                        aria-expanded={showCommands}
                        aria-label="Введите действие"
                    />

                    <VoiceButton
                        isRecording={isRecording}
                        isSupported={isSpeechSupported}
                        onClick={handleVoiceInput}
                    />
                </div>

                {/* Кнопка отправки */}
                <button
                    type="submit"
                    disabled={cannotSubmit}
                    aria-label={isSubmittingAction ? 'Отправка...' : 'Отправить действие'}
                    aria-busy={isSubmittingAction}
                    className={cn(
                        'h-[58px] px-6 rounded-2xl font-bold',
                        'flex items-center justify-center gap-2',
                        'transition-all active:scale-95 shadow-xl',
                        'disabled:opacity-50 disabled:grayscale disabled:scale-100 disabled:cursor-not-allowed',
                        cannotSubmit
                            ? 'bg-neutral-800 text-neutral-500'
                            : 'bg-orange-600 hover:bg-orange-500 text-white shadow-orange-600/20'
                    )}
                >
                    {isSubmittingAction ? (
                        <div
                            className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin"
                            aria-hidden="true"
                        />
                    ) : (
                        <>
                            <span className="hidden sm:inline" aria-hidden="true">
                                Отправить
                            </span>
                            <Send size={20} aria-hidden="true" />
                        </>
                    )}
                </button>
            </form>

            {/* Подсказка статуса */}
            {me?.isReady && !isGenerating && (
                <p
                    role="status"
                    aria-live="polite"
                    className="pb-2 text-center text-xs text-neutral-500"
                >
                    Действие отправлено. Ожидаем других игроков...
                </p>
            )}
        </div>
    )
}