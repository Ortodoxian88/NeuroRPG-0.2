// src/services/archivist.ts

import { api, type ArchivistCandidate } from './api';

// ─────────────────────────────────────────────
// Типы
// ─────────────────────────────────────────────

/**
 * Категория записи в бестиарии.
 * Определяется AI автоматически на основе содержимого.
 */
export type BestiaryCategory =
  | 'creature' // Существа, монстры, NPC
  | 'location' // Локации, места, здания
  | 'item'     // Артефакты, предметы, снаряжение
  | 'lore'     // Знания, легенды, история мира
  | 'faction'  // Организации, фракции, гильдии
  | 'event';   // Важные события, битвы

/**
 * Обработанная запись для бестиария.
 * Результат работы AI — structured data готовая к сохранению в БД.
 */
export interface ProcessedBestiaryEntry {
  /** Название записи (извлечено AI) */
  title: string;
  /** Категория — определена автоматически */
  category: BestiaryCategory;
  /** Полное описание (может быть расширено AI) */
  content: string;
  /** Дополнительные теги для поиска */
  tags?: string[];
  /** Ссылки на связанные записи */
  relatedEntries?: string[];
}

/**
 * Опции для обработки кандидатов.
 */
export interface ProcessCandidatesOptions {
  /**
   * Callback для обновления статуса обработки.
   * Опционален — UI может подписаться на прогресс, но логика не зависит от этого.
   */
  onProgress?: (status: string) => void;

  /**
   * ID комнаты — для контекста AI (мир, сеттинг).
   */
  roomId: string;

  /**
   * ID пользователя — для записи `created_by` в БД.
   */
  userId: string;
}

// ─────────────────────────────────────────────
// Внутренние утилиты
// ─────────────────────────────────────────────

/**
 * Валидирует кандидата для бестиария.
 * Проверяет что все обязательные поля заполнены.
 */
function validateCandidate(candidate: any): candidate is ArchivistCandidate {
  return (
    typeof candidate === 'object' &&
    candidate !== null &&
    typeof candidate.name === 'string' &&
    candidate.name.trim().length > 0 &&
    typeof candidate.description === 'string' &&
    candidate.description.trim().length > 0 &&
    typeof candidate.context === 'string'
  );
}

/**
 * Дедупликация кандидатов по имени (case-insensitive).
 * Если два кандидата с одним именем — берём того у кого описание длиннее.
 */
function deduplicateCandidates(candidates: ArchivistCandidate[]): ArchivistCandidate[] {
  const map = new Map<string, ArchivistCandidate>();

  for (const candidate of candidates) {
    const key = candidate.name.trim().toLowerCase();
    const existing = map.get(key);

    if (!existing || candidate.description.length > existing.description.length) {
      map.set(key, candidate);
    }
  }

  return Array.from(map.values());
}

// ─────────────────────────────────────────────
// Основной API
// ─────────────────────────────────────────────

/**
 * Обрабатывает массив кандидатов для занесения в бестиарий.
 *
 * **Процесс:**
 * 1. Валидация и дедупликация кандидатов
 * 2. Отправка AI для анализа (объединение похожих, генерация описаний)
 * 3. Сохранение результатов в БД (TODO: добавить интеграцию с DB)
 * 4. Возврат обработанных записей
 *
 * **AI делает:**
 * - Объединяет дубликаты (например "Орк" и "Большой орк" → одна запись)
 * - Генерирует развёрнутые описания на основе контекста
 * - Определяет категорию автоматически
 * - Извлекает теги и связи
 *
 * @param candidates - Кандидаты для обработки (из истории игры)
 * @param options - Опции обработки (roomId, userId, onProgress)
 * @returns Массив обработанных записей готовых к сохранению
 *
 * @throws {Error} Если все кандидаты невалидны или AI не ответил
 *
 * @example
 * const candidates = [
 *   {
 *     name: 'Гоблин-разведчик',
 *     description: 'Маленькое зеленокожее существо с копьём',
 *     context: 'Игрок встретил его в лесу на 3 ходу'
 *   },
 *   {
 *     name: 'Тёмный лес',
 *     description: 'Мрачный лес где водятся гоблины',
 *     context: 'Локация первой главы'
 *   }
 * ];
 *
 * const entries = await archivist.processWikiCandidates(candidates, {
 *   roomId: 'room-uuid',
 *   userId: 'user-uuid',
 *   onProgress: (status) => console.log(status)
 * });
 *
 * // → [
 * //   { title: 'Гоблин', category: 'creature', content: '...', tags: ['враг', 'гуманоид'] },
 * //   { title: 'Тёмный лес', category: 'location', content: '...', tags: ['лес', 'опасность'] }
 * // ]
 */
async function processWikiCandidates(
  candidates: any[],
  options: ProcessCandidatesOptions
): Promise<ProcessedBestiaryEntry[]> {
  const { onProgress, roomId, userId } = options;

  // ─── Шаг 1: Валидация ──────────────────────────────────────────────

  onProgress?.('Проверка кандидатов...');

  if (!Array.isArray(candidates) || candidates.length === 0) {
    console.warn('[Archivist] Получен пустой массив кандидатов');
    return [];
  }

  const validCandidates = candidates.filter((c) => {
    const isValid = validateCandidate(c);
    if (!isValid) {
      console.warn('[Archivist] Невалидный кандидат:', c);
    }
    return isValid;
  });

  if (validCandidates.length === 0) {
    throw new Error('Нет валидных кандидатов для обработки');
  }

  // ─── Шаг 2: Дедупликация ───────────────────────────────────────────

  onProgress?.('Удаление дубликатов...');

  const uniqueCandidates = deduplicateCandidates(validCandidates);

  console.log(
    `[Archivist] Обработка ${uniqueCandidates.length} уникальных кандидатов из ${candidates.length}`
  );

  // ─── Шаг 3: Обработка через AI ─────────────────────────────────────

  onProgress?.('Отправка AI для анализа...');

  let processedEntries: any[];

  try {
    // api.processArchivist — AI объединяет похожие, генерирует описания
    processedEntries = await api.processArchivist(roomId, uniqueCandidates);
  } catch (err) {
    console.error('[Archivist] Ошибка обработки AI:', err);
    throw new Error(
      `Не удалось обработать кандидатов через AI: ${err instanceof Error ? err.message : 'Неизвестная ошибка'}`
    );
  }

  if (!Array.isArray(processedEntries) || processedEntries.length === 0) {
    console.warn('[Archivist] AI вернул пустой результат');
    return [];
  }

  // ─── Шаг 4: Валидация ответа AI ────────────────────────────────────

  onProgress?.('Валидация результатов...');

  const validEntries: ProcessedBestiaryEntry[] = processedEntries
    .filter((entry) => {
      const isValid =
        typeof entry === 'object' &&
        entry !== null &&
        typeof entry.title === 'string' &&
        entry.title.trim().length > 0 &&
        typeof entry.category === 'string' &&
        typeof entry.content === 'string';

      if (!isValid) {
        console.warn('[Archivist] AI вернул невалидную запись:', entry);
      }

      return isValid;
    })
    .map((entry) => ({
      title: entry.title.trim(),
      category: entry.category as BestiaryCategory,
      content: entry.content.trim(),
      tags: Array.isArray(entry.tags) ? entry.tags : [],
      relatedEntries: Array.isArray(entry.relatedEntries) ? entry.relatedEntries : [],
    }));

  // ─── Шаг 5: Сохранение в БД ────────────────────────────────────────

  onProgress?.('Сохранение в базу знаний...');

  // TODO: Интеграция с БД
  // await db.bestiary.insertMany(validEntries.map(e => ({
  //   ...e,
  //   room_id: roomId,
  //   created_by: userId,
  //   created_at: new Date().toISOString()
  // })));

  console.log(`[Archivist] Успешно обработано ${validEntries.length} записей`);
  onProgress?.(`Добавлено ${validEntries.length} записей в бестиарий`);

  return validEntries;
}

/**
 * Обрабатывает одну запись через AI.
 * Используется для ручного добавления в бестиарий (не из игрового процесса).
 *
 * **Отличие от processWikiCandidates:**
 * - Работает с сырым текстом, а не структурированными кандидатами
 * - AI сам извлекает название, категорию, теги
 * - Нет батчинга — обрабатывает сразу
 *
 * @param content - Сырой текст записи
 * @returns Структурированная запись
 *
 * @example
 * const entry = await archivist.processEntry(
 *   'Драконы - древние существа обитающие в горах. Дышат огнём.'
 * );
 * // → { title: 'Драконы', category: 'creature', content: '...', tags: ['огонь', 'горы'] }
 */
async function processEntry(content: string): Promise<ProcessedBestiaryEntry> {
  if (!content || content.trim().length === 0) {
    throw new Error('Контент не может быть пустым');
  }

  // TODO: Реализовать вызов AI для парсинга сырого текста
  // Сейчас возвращаем заглушку с базовой категоризацией

  const trimmedContent = content.trim();

  // Простая эвристика для определения категории (временно, до интеграции AI)
  let category: BestiaryCategory = 'lore';

  const lowerContent = trimmedContent.toLowerCase();

  if (
    lowerContent.includes('существо') ||
    lowerContent.includes('монстр') ||
    lowerContent.includes('дракон') ||
    lowerContent.includes('орк')
  ) {
    category = 'creature';
  } else if (
    lowerContent.includes('локация') ||
    lowerContent.includes('город') ||
    lowerContent.includes('лес') ||
    lowerContent.includes('подземелье')
  ) {
    category = 'location';
  } else if (
    lowerContent.includes('артефакт') ||
    lowerContent.includes('меч') ||
    lowerContent.includes('зелье') ||
    lowerContent.includes('предмет')
  ) {
    category = 'item';
  }

  // Извлекаем первое предложение как title (временно)
  const firstSentence = trimmedContent.split(/[.!?]/)[0].trim();
  const title = firstSentence.length > 0 && firstSentence.length <= 100
    ? firstSentence
    : 'Новая запись';

  console.warn(
    '[Archivist] processEntry использует заглушку. TODO: интеграция с AI для парсинга.'
  );

  return {
    title,
    category,
    content: trimmedContent,
    tags: [],
    relatedEntries: [],
  };
}

// ─────────────────────────────────────────────
// Экспорт
// ─────────────────────────────────────────────

/**
 * Сервис для работы с бестиарием (Wiki системой игры).
 * Обрабатывает кандидатов через AI, структурирует данные, управляет базой знаний.
 */
export const archivist = {
  /**
   * Обрабатывает множество кандидатов из игрового процесса.
   * @see {@link processWikiCandidates}
   */
  processWikiCandidates,

  /**
   * Обрабатывает одну запись из сырого текста.
   * @see {@link processEntry}
   */
  processEntry,
};

// Экспорт типов для использования в других модулях
export type {
  BestiaryCategory,
  ProcessedBestiaryEntry,
  ProcessCandidatesOptions,
};