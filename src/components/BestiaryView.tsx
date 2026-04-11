// src/views/BestiaryView.tsx

import React, { useEffect, useState, useMemo, useCallback } from 'react'
import {
    ArrowLeft, BookOpen, Search, Tag,
    Info, Feather, AlertCircle, Loader2,
} from 'lucide-react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { cn } from '../lib/utils'
import { api } from '../services/api'
import type { BestiaryEntry, AppSettings, BestiaryRow } from '../types'

// ─── Типы ─────────────────────────────────────────────────────────────────────

interface BestiaryViewProps {
    onBack: () => void
    appSettings: AppSettings
}

type LoadingState = 'idle' | 'loading' | 'success' | 'error'

// ─── Утилиты ──────────────────────────────────────────────────────────────────

/**
 * Маппинг BestiaryRow из БД → BestiaryEntry для UI
 */
function mapBestiaryRow(row: BestiaryRow): BestiaryEntry {
    return {
        id: row.id,
        title: row.title,
        category: row.category,
        content: row.content,
        tags: row.tags,
        nature: row.nature,
        level: row.knowledge_level,
        authorNotes: row.author_notes, // snake_case → camelCase
    }
}

/**
 * Debounce хук
 */
function useDebounce<T>(value: T, delay: number): T {
    const [debouncedValue, setDebouncedValue] = useState(value)

    useEffect(() => {
        const timer = setTimeout(() => setDebouncedValue(value), delay)
        return () => clearTimeout(timer)
    }, [value, delay])

    return debouncedValue
}

/**
 * Хук темы — вынесено из inline проверок
 */
function useTheme(appSettings: AppSettings) {
    return useMemo(() => {
        const isLight = appSettings.theme === 'light'

        return {
            isLight,
            // Цвета бестиария (пергамент)
            bg: isLight ? 'bg-[#f4ecd8]' : 'bg-neutral-950',
            bgCard: isLight ? 'bg-[#fdfbf7]' : 'bg-neutral-900',
            border: isLight ? 'border-[#d3c5a3]' : 'border-neutral-800',
            text: isLight ? 'text-[#3e2723]' : 'text-neutral-100',
            textSecondary: isLight ? 'text-[#3e2723]/70' : 'text-neutral-400',
            hover: isLight ? 'hover:bg-[#e8dcc4]' : 'hover:bg-neutral-900',
        }
    }, [appSettings.theme])
}

// ─── Компоненты ───────────────────────────────────────────────────────────────

interface EntryCardProps {
    entry: BestiaryEntry
    onClick: () => void
    theme: ReturnType<typeof useTheme>
}

const EntryCard: React.FC<EntryCardProps> = ({ entry, onClick, theme }) => (
    <button
        onClick={onClick}
        className={cn(
            'text-left border rounded-xl p-4',
            'transition-all hover:scale-[1.02] active:scale-[0.98]',
            'flex flex-col gap-2 focus:outline-none focus:ring-2 focus:ring-orange-500',
            theme.bgCard,
            theme.border,
            theme.isLight ? 'shadow-sm hover:shadow-md' : 'hover:border-neutral-700'
        )}
        aria-label={`Открыть запись: ${entry.title}`}
    >
        {/* Заголовок + уровень */}
        <div className="flex justify-between items-start gap-2">
            <h2
                className={cn(
                    'text-lg font-bold font-serif leading-tight',
                    theme.isLight ? 'text-orange-700' : 'text-orange-500'
                )}
            >
                {entry.title}
            </h2>

            {entry.level && (
                <span
                    className={cn(
                        'text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0',
                        theme.isLight
                            ? 'bg-neutral-200 text-neutral-600'
                            : 'bg-neutral-800 text-neutral-400'
                    )}
                    aria-label={`Уровень знаний: ${entry.level}`}
                >
                    LVL {entry.level}
                </span>
            )}
        </div>

        {/* Категория + природа */}
        {entry.category && (
            <div className="flex items-center gap-2">
                <p className={cn('text-xs uppercase tracking-wider opacity-60 font-semibold')}>
                    {entry.category}
                </p>

                {entry.nature && (
                    <span
                        className={cn(
                            'text-[9px] px-1.5 py-0.5 rounded border',
                            entry.nature === 'positive'
                                ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-400 border-green-200 dark:border-green-800/50'
                                : entry.nature === 'negative'
                                    ? 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-400 border-red-200 dark:border-red-800/50'
                                    : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 border-neutral-200 dark:border-neutral-700'
                        )}
                    >
                        {entry.nature === 'positive'
                            ? 'Благотворное'
                            : entry.nature === 'negative'
                                ? 'Вредоносное'
                                : 'Нейтральное'}
                    </span>
                )}
            </div>
        )}

        {/* Теги */}
        {entry.tags && entry.tags.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1" role="list" aria-label="Теги записи">
                {entry.tags.slice(0, 3).map((tag) => (
                    <span
                        key={tag}
                        className="text-[10px] px-1.5 py-0.5 rounded-sm bg-orange-100 dark:bg-orange-900/30 text-orange-800 dark:text-orange-400"
                        role="listitem"
                    >
                        {tag}
                    </span>
                ))}
                {entry.tags.length > 3 && (
                    <span
                        className="text-[10px] px-1.5 py-0.5 rounded-sm bg-neutral-100 dark:bg-neutral-800 text-neutral-500"
                        aria-label={`Ещё ${entry.tags.length - 3} тегов`}
                    >
                        +{entry.tags.length - 3}
                    </span>
                )}
            </div>
        )}
    </button>
)

interface EntryDetailProps {
    entry: BestiaryEntry
    onBack: () => void
    theme: ReturnType<typeof useTheme>
}

const EntryDetail: React.FC<EntryDetailProps> = ({ entry, onBack, theme }) => (
    <div
        className={cn(
            'flex-1 flex flex-col h-full overflow-hidden',
            theme.bg
        )}
    >
        {/* Хедер */}
        <header
            className={cn(
                'p-4 border-b flex items-center gap-4',
                'backdrop-blur-md sticky top-0 z-10',
                theme.bg + '/90',
                theme.border
            )}
        >
            <button
                onClick={onBack}
                className={cn('p-2 rounded-full transition-colors', theme.hover)}
                aria-label="Вернуться к списку"
            >
                <ArrowLeft
                    size={24}
                    className={theme.isLight ? 'text-orange-700' : 'text-orange-500'}
                />
            </button>

            <div className="flex-1 min-w-0">
                <h1
                    className={cn(
                        'text-xl font-bold font-serif truncate',
                        theme.text
                    )}
                >
                    {entry.title}
                </h1>
                <p
                    className={cn(
                        'text-xs uppercase tracking-widest',
                        theme.isLight ? 'text-orange-700/70' : 'text-orange-500/70'
                    )}
                >
                    {entry.category || 'Неизвестно'}
                </p>
            </div>
        </header>

        {/* Контент */}
        <div className="flex-1 overflow-y-auto p-6">
            <article
                className={cn(
                    'max-w-2xl mx-auto rounded-sm p-8 shadow-2xl relative',
                    theme.bgCard,
                    'border',
                    theme.border
                )}
            >
                {/* Декоративные углы */}
                <div
                    className={cn(
                        'absolute top-2 left-2 w-4 h-4 border-t-2 border-l-2',
                        theme.isLight ? 'border-orange-800/20' : 'border-orange-500/20'
                    )}
                    aria-hidden="true"
                />
                <div
                    className={cn(
                        'absolute top-2 right-2 w-4 h-4 border-t-2 border-r-2',
                        theme.isLight ? 'border-orange-800/20' : 'border-orange-500/20'
                    )}
                    aria-hidden="true"
                />
                <div
                    className={cn(
                        'absolute bottom-2 left-2 w-4 h-4 border-b-2 border-l-2',
                        theme.isLight ? 'border-orange-800/20' : 'border-orange-500/20'
                    )}
                    aria-hidden="true"
                />
                <div
                    className={cn(
                        'absolute bottom-2 right-2 w-4 h-4 border-b-2 border-r-2',
                        theme.isLight ? 'border-orange-800/20' : 'border-orange-500/20'
                    )}
                    aria-hidden="true"
                />

                {/* Метаданные */}
                <div className="flex flex-wrap gap-2 mb-6" role="list" aria-label="Метаданные записи">
                    {entry.tags?.map((tag) => (
                        <span
                            key={tag}
                            className="px-2 py-1 bg-orange-100 dark:bg-orange-900/30 text-orange-800 dark:text-orange-400 text-xs rounded-md border border-orange-200 dark:border-orange-800/50 flex items-center gap-1"
                            role="listitem"
                        >
                            <Tag size={10} aria-hidden="true" /> {tag}
                        </span>
                    ))}

                    <span
                        className="px-2 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-400 text-xs rounded-md border border-blue-200 dark:border-blue-800/50 flex items-center gap-1"
                        role="listitem"
                    >
                        <Info size={10} aria-hidden="true" /> Уровень знаний: {entry.level || 1}
                    </span>

                    {entry.nature && (
                        <span
                            className={cn(
                                'px-2 py-1 text-xs rounded-md border flex items-center gap-1',
                                entry.nature === 'positive'
                                    ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-400 border-green-200 dark:border-green-800/50'
                                    : entry.nature === 'negative'
                                        ? 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-400 border-red-200 dark:border-red-800/50'
                                        : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 border-neutral-200 dark:border-neutral-700'
                            )}
                            role="listitem"
                        >
                            {entry.nature === 'positive'
                                ? 'Благотворное'
                                : entry.nature === 'negative'
                                    ? 'Вредоносное'
                                    : 'Нейтральное'}
                        </span>
                    )}
                </div>

                {/* Основной контент */}
                <div
                    className={cn(
                        'prose prose-sm sm:prose-base max-w-none font-serif',
                        theme.isLight
                            ? 'prose-stone prose-headings:text-[#3e2723] prose-a:text-orange-700'
                            : 'prose-invert prose-headings:text-neutral-100 prose-a:text-orange-400'
                    )}
                >
                    <Markdown remarkPlugins={[remarkGfm]}>{entry.content}</Markdown>
                </div>

                {/* Авторские заметки */}
                {entry.authorNotes && (
                    <div
                        className={cn(
                            'mt-8 pt-6 border-t',
                            theme.isLight
                                ? 'border-orange-800/10'
                                : 'border-orange-500/10'
                        )}
                    >
                        <div className="flex items-start gap-3">
                            <Feather
                                className={cn(
                                    'mt-1 shrink-0',
                                    theme.isLight ? 'text-orange-700/50' : 'text-orange-500/50'
                                )}
                                size={20}
                                aria-hidden="true"
                            />
                            <blockquote
                                className={cn(
                                    'text-sm italic font-serif',
                                    theme.isLight
                                        ? 'text-orange-900/70'
                                        : 'text-orange-200/70'
                                )}
                            >
                                "{entry.authorNotes}"
                                <br />
                                <cite className="text-xs not-italic opacity-70">
                                    — Магистр Элиас
                                </cite>
                            </blockquote>
                        </div>
                    </div>
                )}
            </article>
        </div>
    </div>
)

// ─── Основной компонент ───────────────────────────────────────────────────────

export default function BestiaryView({ onBack, appSettings }: BestiaryViewProps) {
    const theme = useTheme(appSettings)

    const [entries, setEntries] = useState<BestiaryEntry[]>([])
    const [loadingState, setLoadingState] = useState<LoadingState>('idle')
    const [error, setError] = useState<string | null>(null)

    const [search, setSearch] = useState('')
    const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
    const [selectedEntry, setSelectedEntry] = useState<BestiaryEntry | null>(null)

    // Debounce поиска — запрос фильтрации не чаще раза в 300мс
    const debouncedSearch = useDebounce(search, 300)

    // Загрузка данных
    useEffect(() => {
        const fetchBestiary = async () => {
            setLoadingState('loading')
            setError(null)

            try {
                const data = await api.getBestiary()
                const mapped = data.map(mapBestiaryRow)
                setEntries(mapped)
                setLoadingState('success')
            } catch (err) {
                console.error('[Bestiary] Ошибка загрузки:', err)
                setError('Не удалось загрузить энциклопедию')
                setLoadingState('error')
            }
        }

        fetchBestiary()
    }, [])

    // Категории
    const categories = useMemo(() => {
        const cats = new Set(entries.map((e) => e.category).filter(Boolean))
        return Array.from(cats).sort()
    }, [entries])

    // Фильтрация
    const filteredEntries = useMemo(() => {
        return entries.filter((e) => {
            const matchesSearch =
                !debouncedSearch ||
                e.title.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
                e.tags?.some((t) => t.toLowerCase().includes(debouncedSearch.toLowerCase()))

            const matchesCategory = !selectedCategory || e.category === selectedCategory

            return matchesSearch && matchesCategory
        })
    }, [entries, debouncedSearch, selectedCategory])

    const handleEntryClick = useCallback((entry: BestiaryEntry) => {
        setSelectedEntry(entry)
    }, [])

    const handleBackToList = useCallback(() => {
        setSelectedEntry(null)
    }, [])

    // ─── Детальный вид ─────────────────────────────────────────────────────────

    if (selectedEntry) {
        return (
            <EntryDetail
                entry={selectedEntry}
                onBack={handleBackToList}
                theme={theme}
            />
        )
    }

    // ─── Список записей ────────────────────────────────────────────────────────

    return (
        <div className={cn('flex-1 flex flex-col h-full overflow-hidden', theme.bg)}>
            {/* Хедер */}
            <header
                className={cn(
                    'p-4 border-b flex flex-col gap-4 backdrop-blur-md',
                    theme.bg + '/90',
                    theme.border
                )}
            >
                <div className="flex items-center gap-4">
                    <button
                        onClick={onBack}
                        className={cn('p-2 rounded-full transition-colors', theme.hover)}
                        aria-label="Вернуться"
                    >
                        <ArrowLeft
                            size={24}
                            className={theme.isLight ? 'text-orange-700' : 'text-orange-500'}
                        />
                    </button>

                    <h1
                        className={cn(
                            'text-2xl font-bold flex items-center gap-2 font-serif',
                            theme.text
                        )}
                    >
                        <BookOpen
                            className={theme.isLight ? 'text-orange-700' : 'text-orange-500'}
                            aria-hidden="true"
                        />
                        Великая Энциклопедия
                    </h1>
                </div>

                {/* Поиск */}
                <div className="relative">
                    <Search
                        className={cn(
                            'absolute left-4 top-1/2 -translate-y-1/2',
                            theme.isLight ? 'text-orange-700/50' : 'text-orange-500/50'
                        )}
                        size={20}
                        aria-hidden="true"
                    />
                    <input
                        type="search"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Поиск по архивам (название, теги)..."
                        className={cn(
                            'w-full border rounded-xl py-3 pl-12 pr-4 text-base',
                            'focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500',
                            'outline-none transition-all font-serif',
                            theme.bgCard,
                            theme.border,
                            theme.text,
                            theme.isLight && 'placeholder:text-[#3e2723]/40'
                        )}
                        aria-label="Поиск по энциклопедии"
                    />
                </div>

                {/* Фильтр категорий */}
                {categories.length > 0 && (
                    <div
                        className="flex gap-2 overflow-x-auto pb-2 hide-scrollbar"
                        role="tablist"
                        aria-label="Фильтр по категориям"
                    >
                        <button
                            onClick={() => setSelectedCategory(null)}
                            role="tab"
                            aria-selected={selectedCategory === null}
                            className={cn(
                                'px-4 py-1.5 rounded-full text-sm font-medium',
                                'whitespace-nowrap transition-colors border',
                                selectedCategory === null
                                    ? 'bg-orange-700 text-white border-orange-700 dark:bg-orange-600 dark:border-orange-600'
                                    : cn(theme.bgCard, theme.border, theme.text)
                            )}
                        >
                            Все записи ({entries.length})
                        </button>

                        {categories.map((cat) => {
                            const count = entries.filter((e) => e.category === cat).length
                            return (
                                <button
                                    key={cat}
                                    onClick={() => setSelectedCategory(cat)}
                                    role="tab"
                                    aria-selected={selectedCategory === cat}
                                    className={cn(
                                        'px-4 py-1.5 rounded-full text-sm font-medium',
                                        'whitespace-nowrap transition-colors border',
                                        selectedCategory === cat
                                            ? 'bg-orange-700 text-white border-orange-700 dark:bg-orange-600 dark:border-orange-600'
                                            : cn(theme.bgCard, theme.border, theme.text)
                                    )}
                                >
                                    {cat} ({count})
                                </button>
                            )
                        })}
                    </div>
                )}
            </header>

            {/* Контент */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {/* Загрузка */}
                {loadingState === 'loading' && (
                    <div
                        className="flex flex-col items-center justify-center h-full"
                        role="status"
                        aria-live="polite"
                    >
                        <Loader2
                            size={48}
                            className={cn(
                                'mb-4 animate-spin',
                                theme.isLight ? 'text-orange-700' : 'text-orange-500'
                            )}
                        />
                        <p className={cn('font-serif text-lg', theme.textSecondary)}>
                            Архивариус листает страницы...
                        </p>
                    </div>
                )}

                {/* Ошибка */}
                {loadingState === 'error' && (
                    <div
                        className="flex flex-col items-center justify-center h-full text-center"
                        role="alert"
                    >
                        <AlertCircle
                            size={48}
                            className="mb-4 text-red-500"
                            aria-hidden="true"
                        />
                        <p className={cn('font-serif text-lg mb-4', theme.text)}>
                            {error}
                        </p>
                        <button
                            onClick={() => window.location.reload()}
                            className={cn(
                                'px-4 py-2 rounded-lg border transition-colors',
                                theme.bgCard,
                                theme.border,
                                theme.hover
                            )}
                        >
                            Перезагрузить страницу
                        </button>
                    </div>
                )}

                {/* Пустой бестиарий */}
                {loadingState === 'success' && entries.length === 0 && (
                    <div
                        className="flex flex-col items-center justify-center h-full text-center opacity-50"
                        role="status"
                    >
                        <Feather
                            size={48}
                            className={cn(
                                'mb-4',
                                theme.isLight ? 'text-orange-700' : 'text-orange-500'
                            )}
                            aria-hidden="true"
                        />
                        <p className="font-serif text-lg">
                            Страницы пусты.
                            <br />
                            Архивариус ждет ваших открытий.
                        </p>
                    </div>
                )}

                {/* Ничего не найдено */}
                {loadingState === 'success' && entries.length > 0 && filteredEntries.length === 0 && (
                    <div className="text-center py-8" role="status">
                        <p className="font-serif opacity-50">
                            В архивах нет упоминаний об этом.
                        </p>
                    </div>
                )}

                {/* Список записей */}
                {loadingState === 'success' && filteredEntries.length > 0 && (
                    <div
                        className="grid grid-cols-1 sm:grid-cols-2 gap-3"
                        role="list"
                        aria-label="Записи энциклопедии"
                    >
                        {filteredEntries.map((entry) => (
                            <EntryCard
                                key={entry.id}
                                entry={entry}
                                onClick={() => handleEntryClick(entry)}
                                theme={theme}
                            />
                        ))}
                    </div>
                )}
            </div>
        </div>
    )
}

BestiaryView.displayName = 'BestiaryView'