// src/lib/utils.ts

import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Объединяет CSS-классы с автоматическим разрешением конфликтов Tailwind.
 *
 * Использует:
 * - `clsx` — для условного объединения классов (поддерживает строки, объекты, массивы)
 * - `tailwind-merge` — для разрешения конфликтов Tailwind классов (например, `px-2 px-4` → `px-4`)
 *
 * **Зачем это нужно:**
 * Tailwind генерирует классы, которые могут конфликтовать (например, `text-sm text-lg`).
 * Без `twMerge` оба класса попадут в DOM и результат непредсказуем (зависит от порядка в CSS).
 * `twMerge` оставляет только последний — гарантирует предсказуемость.
 *
 * **Примеры:**
 *
 * @example
 * // Базовое использование — объединение строк
 * cn('text-sm', 'font-bold', 'text-red-500')
 * // → 'text-sm font-bold text-red-500'
 *
 * @example
 * // Условные классы через объект
 * cn('p-4', { 'bg-red-500': isError, 'bg-green-500': isSuccess })
 * // → 'p-4 bg-red-500' (если isError === true)
 *
 * @example
 * // Разрешение конфликтов Tailwind
 * cn('px-2 py-1', 'px-4') // без twMerge → 'px-2 py-1 px-4' (конфликт!)
 * // → 'py-1 px-4' (twMerge убрал px-2)
 *
 * @example
 * // Переопределение стилей через пропсы (частый паттерн)
 * function Button({ className, ...props }) {
 *   return <button className={cn('px-4 py-2 bg-blue-500', className)} {...props} />
 * }
 * <Button className="bg-red-500" /> // → фон будет красным, не синим
 *
 * @example
 * // Массивы и вложенные условия
 * cn(
 *   'base-class',
 *   ['array-class-1', 'array-class-2'],
 *   condition && 'conditional-class',
 *   {
 *     'object-class-1': true,
 *     'object-class-2': false,
 *   }
 * )
 * // → 'base-class array-class-1 array-class-2 conditional-class object-class-1'
 *
 * @param inputs - Любые значения, поддерживаемые `clsx`: строки, объекты, массивы, undefined, null
 * @returns Объединённая строка CSS-классов без конфликтов
 *
 * @see https://github.com/lukeed/clsx — документация clsx
 * @see https://github.com/dcastil/tailwind-merge — документация tailwind-merge
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(...inputs));
}

/**
 * Алиас для `cn` — для тех, кто привык к `classNames` вместо `cn`.
 * @see {@link cn}
 */
export const classNames = cn;