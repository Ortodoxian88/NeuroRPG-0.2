// src/lib/health.ts

/**
 * Пороги здоровья для определения состояния персонажа (в процентах).
 * Вынесены в константы — геймдизайнер может изменить баланс в одном месте.
 */
export const HEALTH_THRESHOLDS = {
    /** Выше этого порога — персонаж здоров (зелёный) */
    HEALTHY: 70,
    /** Выше этого порога — персонаж ранен (жёлтый), ниже — критическое состояние (красный) */
    WOUNDED: 30,
  } as const;
  
  /**
   * Семантическое состояние здоровья персонажа.
   * Не зависит от CSS-фреймворка — чистая бизнес-логика.
   */
  export type HealthStatus = 'healthy' | 'wounded' | 'critical' | 'dead' | 'invalid';
  
  /**
   * Tailwind CSS классы для цвета HP.
   * Вынесены в тип — TypeScript знает точный набор возможных значений.
   */
  export type HealthColorClass =
    | 'text-green-500'
    | 'text-yellow-500'
    | 'text-red-500'
    | 'text-neutral-500';
  
  /**
   * Результат расчёта статуса здоровья — и семантика, и CSS-класс.
   * Разделяем ответственность: компонент может использовать и то, и другое.
   */
  export interface HealthInfo {
    /** Семантическое состояние — для логики */
    status: HealthStatus;
    /** CSS-класс Tailwind — для UI */
    colorClass: HealthColorClass;
    /** Процент здоровья — для прогресс-баров */
    percentage: number;
  }
  
  /**
   * Определяет статус здоровья персонажа на основе текущего и максимального HP.
   *
   * **Логика:**
   * - `hp === 0` → мёртв (независимо от max)
   * - `max <= 0` → невалидные данные
   * - `hp < 0` → невалидные данные
   * - `hp > 70%` → здоров (зелёный)
   * - `hp > 30%` → ранен (жёлтый)
   * - `hp ≤ 30%` → критическое состояние (красный)
   *
   * @param hp - Текущее здоровье (должно быть ≥ 0)
   * @param max - Максимальное здоровье (должно быть > 0)
   * @returns Объект с семантическим статусом, CSS-классом и процентом
   *
   * @example
   * const health = getHealthInfo(75, 100);
   * // → { status: 'healthy', colorClass: 'text-green-500', percentage: 75 }
   *
   * const criticalHealth = getHealthInfo(10, 100);
   * // → { status: 'critical', colorClass: 'text-red-500', percentage: 10 }
   *
   * const dead = getHealthInfo(0, 100);
   * // → { status: 'dead', colorClass: 'text-neutral-500', percentage: 0 }
   */
  export function getHealthInfo(hp: number, max: number): HealthInfo {
    // ─── Валидация входных данных ───────────────────────────────────────
  
    // Персонаж мёртв — отдельный случай (не ошибка)
    if (hp === 0) {
      return {
        status: 'dead',
        colorClass: 'text-neutral-500',
        percentage: 0,
      };
    }
  
    // Невалидные данные — нельзя рассчитать процент
    if (max <= 0 || hp < 0 || !Number.isFinite(hp) || !Number.isFinite(max)) {
      console.warn(
        `[getHealthInfo] Некорректные данные: hp=${hp}, max=${max}. Ожидается hp ≥ 0, max > 0.`
      );
      return {
        status: 'invalid',
        colorClass: 'text-neutral-500',
        percentage: 0,
      };
    }
  
    // ─── Расчёт процента ─────────────────────────────────────────────────
  
    // Ограничиваем hp значением max — защита от overheal
    const clampedHp = Math.min(hp, max);
    const percentage = (clampedHp / max) * 100;
  
    // ─── Определение статуса ─────────────────────────────────────────────
  
    if (percentage > HEALTH_THRESHOLDS.HEALTHY) {
      return {
        status: 'healthy',
        colorClass: 'text-green-500',
        percentage,
      };
    }
  
    if (percentage > HEALTH_THRESHOLDS.WOUNDED) {
      return {
        status: 'wounded',
        colorClass: 'text-yellow-500',
        percentage,
      };
    }
  
    return {
      status: 'critical',
      colorClass: 'text-red-500',
      percentage,
    };
  }
  
  /**
   * Легаси-функция для обратной совместимости.
   * Возвращает только CSS-класс, как в старой версии.
   *
   * @deprecated Используйте `getHealthInfo()` — она возвращает больше данных.
   *
   * @param hp - Текущее здоровье
   * @param max - Максимальное здоровье
   * @returns Tailwind CSS класс для цвета текста
   */
  export function getHealthColor(hp: number, max: number): HealthColorClass {
    return getHealthInfo(hp, max).colorClass;
  }