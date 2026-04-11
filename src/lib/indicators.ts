// src/lib/typingIndicators.ts

/**
 * Возможные сообщения индикатора печати ИИ.
 * `as const` делает тип readonly tuple — гарантирует неизменность
 * и позволяет TypeScript вывести точные литералы.
 */
export const TYPING_INDICATORS = [
  'ИИ размышляет...',
  'ИИ пишет...',
  'ИИ готовит ответ...',
  'ИИ формулирует мысль...',
  'ИИ советуется с богами...',
] as const;

/**
 * Тип для одной строки индикатора — извлекаем из массива.
 * Результат: "ИИ размышляет..." | "ИИ пишет..." | ...
 */
export type TypingIndicator = (typeof TYPING_INDICATORS)[number];

/**
 * Возвращает случайный индикатор печати из списка.
 * Инкапсулирует логику рандомизации — вызывающий код не знает про Math.random().
 *
 * @returns Строка индикатора, например "ИИ размышляет..."
 *
 * @example
 * const indicator = getRandomTypingIndicator();
 * console.log(indicator); // "ИИ пишет..."
 */
export function getRandomTypingIndicator(): TypingIndicator {
  const index = Math.floor(Math.random() * TYPING_INDICATORS.length);
  return TYPING_INDICATORS[index];
}

/**
 * Возвращает случайный индикатор с защитой от повторов.
 * Гарантирует что два подряд вызова не вернут одно и то же.
 *
 * @param previousIndicator - Предыдущий индикатор (чтобы не повторяться)
 *
 * @example
 * let current = getRandomTypingIndicator();
 * // Пользователь снова видит индикатор — покажем другой
 * current = getRandomTypingIndicatorExcluding(current);
 */
export function getRandomTypingIndicatorExcluding(
  previousIndicator: TypingIndicator | null
): TypingIndicator {
  // Если индикатор всего один — возвращаем его
  if (TYPING_INDICATORS.length === 1) {
    return TYPING_INDICATORS[0];
  }

  let newIndicator: TypingIndicator;

  do {
    newIndicator = getRandomTypingIndicator();
  } while (newIndicator === previousIndicator);

  return newIndicator;
}