// src/components/room/InventoryTab.tsx

import React, { useMemo, useState } from 'react'
import {
    Backpack, Package, Trash2, ArrowRightLeft,
    Utensils, Sword, Shield, Wand2, Wrench,
    Gem, Info, ChevronDown,
} from 'lucide-react'
import { cn } from '@/src/lib/utils'
import type { Player, AppSettings, CharacterInventory, InventoryItem } from '@/src/types'

// ─── Типы ─────────────────────────────────────────────────────────────────────

interface InventoryTabProps {
    me?: Player
    isSpectator: boolean
    onUseItem?: (itemId: string) => void
    onDropItem?: (itemId: string) => void
    onTransferItem?: (itemId: string, targetPlayerId: string) => void
    appSettings?: AppSettings
}

type ItemRarity = 'common' | 'uncommon' | 'rare' | 'very_rare' | 'legendary' | 'artifact'
type ItemType = 'weapon' | 'armor' | 'consumable' | 'tool' | 'treasure' | 'other'
type FilterType = 'all' | ItemType
type SortBy = 'name' | 'type' | 'rarity' | 'weight' | 'value'

// ─── Константы ────────────────────────────────────────────────────────────────

const RARITY_COLORS: Record<ItemRarity, { text: string; bg: string; border: string }> = {
    common: {
        text: 'text-neutral-400',
        bg: 'bg-neutral-500/10',
        border: 'border-neutral-500/20',
    },
    uncommon: {
        text: 'text-green-400',
        bg: 'bg-green-500/10',
        border: 'border-green-500/20',
    },
    rare: {
        text: 'text-blue-400',
        bg: 'bg-blue-500/10',
        border: 'border-blue-500/20',
    },
    very_rare: {
        text: 'text-purple-400',
        bg: 'bg-purple-500/10',
        border: 'border-purple-500/20',
    },
    legendary: {
        text: 'text-orange-400',
        bg: 'bg-orange-500/10',
        border: 'border-orange-500/20',
    },
    artifact: {
        text: 'text-red-400',
        bg: 'bg-red-500/10',
        border: 'border-red-500/20',
    },
}

const RARITY_LABELS: Record<ItemRarity, string> = {
    common: 'Обычный',
    uncommon: 'Необычный',
    rare: 'Редкий',
    very_rare: 'Очень редкий',
    legendary: 'Легендарный',
    artifact: 'Артефакт',
}

const TYPE_LABELS: Record<ItemType, string> = {
    weapon: 'Оружие',
    armor: 'Броня',
    consumable: 'Расходуемое',
    tool: 'Инструмент',
    treasure: 'Сокровище',
    other: 'Прочее',
}

// ─── Утилиты ──────────────────────────────────────────────────────────────────

/**
 * Иконка типа предмета
 */
function getItemTypeIcon(type: ItemType): React.ReactNode {
    const iconClass = 'w-5 h-5'

    switch (type) {
        case 'weapon': return <Sword className={iconClass} />
        case 'armor': return <Shield className={iconClass} />
        case 'consumable': return <Utensils className={iconClass} />
        case 'tool': return <Wrench className={iconClass} />
        case 'treasure': return <Gem className={iconClass} />
        default: return <Package className={iconClass} />
    }
}

/**
 * Форматирование веса
 */
function formatWeight(weight: number): string {
    return weight % 1 === 0 ? `${weight} кг` : `${weight.toFixed(1)} кг`
}

/**
 * Форматирование цены
 */
function formatValue(copper: number): string {
    if (copper >= 100) {
        const gold = Math.floor(copper / 100)
        return `${gold} зм`
    }
    if (copper >= 10) {
        const silver = Math.floor(copper / 10)
        return `${silver} см`
    }
    return `${copper} мм`
}

/**
 * Сортировка предметов
 */
function sortItems(items: InventoryItem[], sortBy: SortBy): InventoryItem[] {
    return [...items].sort((a, b) => {
        switch (sortBy) {
            case 'name':
                return a.name.localeCompare(b.name, 'ru')
            case 'type':
                return a.type.localeCompare(b.type)
            case 'rarity': {
                const rarityOrder: ItemRarity[] = [
                    'common', 'uncommon', 'rare', 'very_rare', 'legendary', 'artifact'
                ]
                const aIndex = rarityOrder.indexOf(a.rarity || 'common')
                const bIndex = rarityOrder.indexOf(b.rarity || 'common')
                return bIndex - aIndex // от легендарного к обычному
            }
            case 'weight':
                return (b.weight || 0) - (a.weight || 0)
            case 'value':
                return (b.value || 0) - (a.value || 0)
            default:
                return 0
        }
    })
}

// ─── Компоненты ───────────────────────────────────────────────────────────────

interface CurrencyDisplayProps {
    currency: { gold: number; silver: number; copper: number }
    isLight: boolean
}

const CurrencyDisplay: React.FC<CurrencyDisplayProps> = ({ currency, isLight }) => {
    if (currency.gold === 0 && currency.silver === 0 && currency.copper === 0) {
        return null
    }

    return (
        <div
            className={cn(
                'p-4 rounded-xl border flex items-center justify-between mb-4',
                isLight
                    ? 'bg-yellow-50 border-yellow-200'
                    : 'bg-yellow-900/10 border-yellow-700/30'
            )}
            role="status"
            aria-label="Валюта"
        >
            <div className="flex items-center gap-2">
                <Gem
                    size={20}
                    className={isLight ? 'text-yellow-600' : 'text-yellow-400'}
                    aria-hidden="true"
                />
                <span
                    className={cn(
                        'text-xs font-bold uppercase tracking-wider',
                        isLight ? 'text-yellow-700' : 'text-yellow-400'
                    )}
                >
                    Валюта
                </span>
            </div>

            <div className="flex items-center gap-4 text-sm font-mono font-bold">
                {currency.gold > 0 && (
                    <span className={isLight ? 'text-yellow-700' : 'text-yellow-300'}>
                        {currency.gold} <span className="text-xs">зм</span>
                    </span>
                )}
                {currency.silver > 0 && (
                    <span className={isLight ? 'text-neutral-500' : 'text-neutral-400'}>
                        {currency.silver} <span className="text-xs">см</span>
                    </span>
                )}
                {currency.copper > 0 && (
                    <span className={isLight ? 'text-orange-700' : 'text-orange-400'}>
                        {currency.copper} <span className="text-xs">мм</span>
                    </span>
                )}
            </div>
        </div>
    )
}

interface ItemCardProps {
    item: InventoryItem
    isLight: boolean
    onUse?: () => void
    onDrop?: () => void
    onInfo?: () => void
}

const ItemCard: React.FC<ItemCardProps> = ({
    item,
    isLight,
    onUse,
    onDrop,
    onInfo,
}) => {
    const rarity = item.rarity || 'common'
    const rarityStyle = RARITY_COLORS[rarity]

    return (
        <article
            className={cn(
                'group p-4 rounded-2xl border transition-all duration-300',
                'flex items-center justify-between',
                isLight
                    ? 'bg-white border-neutral-200 hover:border-orange-200 shadow-sm'
                    : 'bg-neutral-900/50 border-neutral-800 hover:border-neutral-700 hover:bg-neutral-900',
                item.equipped && 'ring-2 ring-orange-500/50'
            )}
            aria-label={`Предмет: ${item.name}`}
        >
            {/* Левая часть — иконка + инфо */}
            <div className="flex items-center gap-4 flex-1 min-w-0">
                {/* Иконка типа */}
                <div
                    className={cn(
                        'w-12 h-12 rounded-xl flex items-center justify-center',
                        'border transition-colors shrink-0',
                        isLight
                            ? 'bg-neutral-100 border-neutral-200'
                            : 'bg-neutral-800 border-neutral-700',
                        'group-hover:border-orange-500/30'
                    )}
                    aria-hidden="true"
                >
                    <div
                        className={cn(
                            'transition-colors',
                            isLight
                                ? 'text-neutral-600 group-hover:text-orange-600'
                                : 'text-neutral-400 group-hover:text-orange-500'
                        )}
                    >
                        {getItemTypeIcon(item.type)}
                    </div>
                </div>

                {/* Информация */}
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                        <h4
                            className={cn(
                                'font-bold transition-colors truncate',
                                isLight
                                    ? 'text-neutral-900 group-hover:text-orange-600'
                                    : 'text-neutral-200 group-hover:text-white'
                            )}
                        >
                            {item.name}
                        </h4>

                        {item.equipped && (
                            <span
                                className={cn(
                                    'px-2 py-0.5 rounded text-[10px] font-bold',
                                    'uppercase tracking-wider shrink-0',
                                    isLight
                                        ? 'bg-orange-100 text-orange-700'
                                        : 'bg-orange-500/20 text-orange-400'
                                )}
                                aria-label="Экипировано"
                            >
                                Надето
                            </span>
                        )}
                    </div>

                    {/* Метаинфо */}
                    <div className="flex items-center gap-3 mt-1 flex-wrap">
                        {/* Редкость */}
                        <span
                            className={cn(
                                'text-[10px] font-bold uppercase tracking-widest',
                                rarityStyle.text
                            )}
                        >
                            {RARITY_LABELS[rarity]}
                        </span>

                        <span
                            className={isLight ? 'text-neutral-300' : 'text-neutral-700'}
                            aria-hidden="true"
                        >
                            •
                        </span>

                        {/* Тип */}
                        <span
                            className={cn(
                                'text-[10px] font-bold uppercase tracking-widest',
                                isLight ? 'text-neutral-500' : 'text-neutral-600'
                            )}
                        >
                            {TYPE_LABELS[item.type]}
                        </span>

                        {/* Вес */}
                        {item.weight !== undefined && item.weight > 0 && (
                            <>
                                <span
                                    className={isLight ? 'text-neutral-300' : 'text-neutral-700'}
                                    aria-hidden="true"
                                >
                                    •
                                </span>
                                <span
                                    className={cn(
                                        'text-[10px] font-mono',
                                        isLight ? 'text-neutral-400' : 'text-neutral-600'
                                    )}
                                >
                                    {formatWeight(item.weight)}
                                </span>
                            </>
                        )}

                        {/* Цена */}
                        {item.value !== undefined && item.value > 0 && (
                            <>
                                <span
                                    className={isLight ? 'text-neutral-300' : 'text-neutral-700'}
                                    aria-hidden="true"
                                >
                                    •
                                </span>
                                <span
                                    className={cn(
                                        'text-[10px] font-mono',
                                        isLight ? 'text-yellow-600' : 'text-yellow-500'
                                    )}
                                    title="Примерная стоимость"
                                >
                                    {formatValue(item.value)}
                                </span>
                            </>
                        )}

                        {/* Количество */}
                        {item.quantity > 1 && (
                            <>
                                <span
                                    className={isLight ? 'text-neutral-300' : 'text-neutral-700'}
                                    aria-hidden="true"
                                >
                                    •
                                </span>
                                <span
                                    className={cn(
                                        'text-[10px] font-bold',
                                        isLight ? 'text-blue-600' : 'text-blue-400'
                                    )}
                                >
                                    ×{item.quantity}
                                </span>
                            </>
                        )}
                    </div>

                    {/* Описание */}
                    {item.description && (
                        <p
                            className={cn(
                                'text-xs mt-2 line-clamp-2',
                                isLight ? 'text-neutral-500' : 'text-neutral-500'
                            )}
                        >
                            {item.description}
                        </p>
                    )}
                </div>
            </div>

            {/* Правая часть — действия */}
            <div className="flex items-center gap-2 ml-4 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                {/* Использовать (consumable) */}
                {item.type === 'consumable' && onUse && (
                    <button
                        onClick={onUse}
                        className={cn(
                            'p-2 rounded-lg transition-colors',
                            isLight
                                ? 'hover:bg-green-100 text-green-600'
                                : 'hover:bg-green-900/30 text-green-400'
                        )}
                        aria-label={`Использовать ${item.name}`}
                        title="Использовать"
                    >
                        <Utensils size={16} />
                    </button>
                )}

                {/* Информация */}
                {onInfo && (
                    <button
                        onClick={onInfo}
                        className={cn(
                            'p-2 rounded-lg transition-colors',
                            isLight
                                ? 'hover:bg-blue-100 text-blue-600'
                                : 'hover:bg-blue-900/30 text-blue-400'
                        )}
                        aria-label={`Информация о ${item.name}`}
                        title="Подробнее"
                    >
                        <Info size={16} />
                    </button>
                )}

                {/* Выбросить */}
                {onDrop && (
                    <button
                        onClick={onDrop}
                        className={cn(
                            'p-2 rounded-lg transition-colors',
                            isLight
                                ? 'hover:bg-red-100 text-red-600'
                                : 'hover:bg-red-900/30 text-red-400'
                        )}
                        aria-label={`Выбросить ${item.name}`}
                        title="Выбросить"
                    >
                        <Trash2 size={16} />
                    </button>
                )}
            </div>
        </article>
    )
}

// ─── Основной компонент ───────────────────────────────────────────────────────

export const InventoryTab: React.FC<InventoryTabProps> = ({
    me,
    isSpectator,
    onUseItem,
    onDropItem,
    onTransferItem,
    appSettings,
}) => {
    const isLight = appSettings?.theme === 'light'

    const [filter, setFilter] = useState<FilterType>('all')
    const [sortBy, setSortBy] = useState<SortBy>('name')

    const inventory = me?.inventory as CharacterInventory | undefined

    const items = useMemo(() => {
        if (!inventory?.items) return []

        let filtered = inventory.items

        // Фильтрация по типу
        if (filter !== 'all') {
            filtered = filtered.filter((item) => item.type === filter)
        }

        // Сортировка
        return sortItems(filtered, sortBy)
    }, [inventory?.items, filter, sortBy])

    const totalWeight = useMemo(() => {
        if (!inventory?.items) return 0
        return inventory.items.reduce((sum, item) => sum + (item.weight || 0) * item.quantity, 0)
    }, [inventory?.items])

    const carryingCapacity = inventory?.carrying_capacity || 50
    const currentWeight = inventory?.current_weight || totalWeight
    const weightPercentage = Math.min((currentWeight / carryingCapacity) * 100, 100)
    const isOverencumbered = currentWeight > carryingCapacity

    if (isSpectator && !me) {
        return (
            <div
                className={cn(
                    'flex-1 flex items-center justify-center',
                    isLight ? 'bg-neutral-50' : 'bg-black'
                )}
            >
                <p className={cn('text-sm', isLight ? 'text-neutral-500' : 'text-neutral-600')}>
                    Выберите игрока для просмотра инвентаря
                </p>
            </div>
        )
    }

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
                        <Backpack
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
                            Инвентарь
                        </h3>
                        <p
                            className={cn(
                                'text-xs uppercase tracking-widest font-medium',
                                isLight ? 'text-neutral-500' : 'text-neutral-500'
                            )}
                        >
                            Предметы и снаряжение
                        </p>
                    </div>
                </div>

                {/* Счётчик предметов */}
                <div className="text-right">
                    <div className="flex items-baseline gap-1">
                        <span className={cn('text-2xl font-black', isLight ? 'text-orange-600' : 'text-orange-500')}>
                            {items.length}
                        </span>
                        <span className={cn('text-xs font-bold uppercase', isLight ? 'text-neutral-400' : 'text-neutral-600')}>
                            / {carryingCapacity}
                        </span>
                    </div>

                    {/* Вес */}
                    <div className="mt-1">
                        <div
                            className={cn(
                                'h-1.5 w-24 rounded-full overflow-hidden',
                                isLight ? 'bg-neutral-200' : 'bg-neutral-800'
                            )}
                            role="progressbar"
                            aria-valuenow={currentWeight}
                            aria-valuemin={0}
                            aria-valuemax={carryingCapacity}
                            aria-label={`Вес: ${formatWeight(currentWeight)} из ${formatWeight(carryingCapacity)}`}
                        >
                            <div
                                className={cn(
                                    'h-full transition-all',
                                    isOverencumbered ? 'bg-red-500' : 'bg-orange-500'
                                )}
                                style={{ width: `${weightPercentage}%` }}
                            />
                        </div>
                        <p className={cn('text-[10px] font-mono mt-0.5', isLight ? 'text-neutral-500' : 'text-neutral-600')}>
                            {formatWeight(currentWeight)} / {formatWeight(carryingCapacity)}
                        </p>
                    </div>
                </div>
            </header>

            {/* Фильтры и сортировка */}
            {items.length > 0 && (
                <div
                    className={cn(
                        'px-6 py-3 border-b flex items-center gap-3',
                        isLight ? 'border-neutral-200' : 'border-neutral-800/50'
                    )}
                >
                    {/* Фильтр по типу */}
                    <select
                        value={filter}
                        onChange={(e) => setFilter(e.target.value as FilterType)}
                        className={cn(
                            'text-xs font-medium px-3 py-1.5 rounded-lg border',
                            isLight
                                ? 'bg-white border-neutral-200 text-neutral-700'
                                : 'bg-neutral-900 border-neutral-700 text-neutral-300'
                        )}
                        aria-label="Фильтр по типу предмета"
                    >
                        <option value="all">Все типы</option>
                        <option value="weapon">Оружие</option>
                        <option value="armor">Броня</option>
                        <option value="consumable">Расходуемое</option>
                        <option value="tool">Инструменты</option>
                        <option value="treasure">Сокровища</option>
                        <option value="other">Прочее</option>
                    </select>

                    {/* Сортировка */}
                    <select
                        value={sortBy}
                        onChange={(e) => setSortBy(e.target.value as SortBy)}
                        className={cn(
                            'text-xs font-medium px-3 py-1.5 rounded-lg border',
                            isLight
                                ? 'bg-white border-neutral-200 text-neutral-700'
                                : 'bg-neutral-900 border-neutral-700 text-neutral-300'
                        )}
                        aria-label="Сортировка"
                    >
                        <option value="name">По имени</option>
                        <option value="type">По типу</option>
                        <option value="rarity">По редкости</option>
                        <option value="weight">По весу</option>
                        <option value="value">По цене</option>
                    </select>
                </div>
            )}

            {/* Список предметов */}
            <div className="flex-1 overflow-y-auto p-6">
                {/* Валюта */}
                {inventory?.currency && (
                    <CurrencyDisplay currency={inventory.currency} isLight={isLight} />
                )}

                {/* Пустое состояние */}
                {items.length === 0 ? (
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
                            <Package
                                size={40}
                                className={isLight ? 'text-neutral-400' : 'text-neutral-600'}
                            />
                        </div>
                        <p className={cn('font-medium italic', isLight ? 'text-neutral-400' : 'text-neutral-500')}>
                            Ваш рюкзак пуст...
                        </p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 gap-3">
                        {items.map((item) => (
                            <ItemCard
                                key={item.id}
                                item={item}
                                isLight={isLight}
                                onUse={
                                    item.type === 'consumable' && onUseItem
                                        ? () => onUseItem(item.id)
                                        : undefined
                                }
                                onDrop={onDropItem ? () => onDropItem(item.id) : undefined}
                                onInfo={() => console.log('Info:', item)}
                            />
                        ))}
                    </div>
                )}
            </div>
        </div>
    )
}

InventoryTab.displayName = 'InventoryTab'