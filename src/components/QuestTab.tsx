// src/components/room/QuestTab.tsx

import React, { useMemo } from 'react';
import { ScrollText, CheckCircle2, Sparkles, Map, Flag } from 'lucide-react';
import { AppSettings } from '@/src/types';
import { cn } from '@/src/lib/utils';

// ─────────────────────────────────────────────
// Типы
// ─────────────────────────────────────────────

/**
 * Структурированный квест — результат парсинга сырой строки.
 * Используем внутри компонента, не экспортируем наружу:
 * снаружи всё ещё приходит string[] (legacy формат от AI).
 */
interface ParsedQuest {
  /** Уникальный ключ для React — на основе содержимого, не индекса */
  id: string;
  /** Текст квеста без служебных меток */
  text: string;
  /** Флаг завершённости */
  isCompleted: boolean;
  /** Оригинальный индекс — для отладки */
  originalIndex: number;
}

interface QuestTabProps {
  /**
   * Массив квестов в виде строк от AI.
   * Может быть undefined/null на практике (несмотря на тип),
   * поэтому явно помечаем как опциональный.
   */
  quests?: string[] | null;
  appSettings?: AppSettings;
}

// ─────────────────────────────────────────────
// Утилиты
// ─────────────────────────────────────────────

/**
 * Метки завершённости, которые может вернуть Gemini AI.
 * Регулярка с флагом /i — нечувствительна к регистру.
 * Вынесено в константу — легко расширять без правки логики.
 */
const COMPLETED_MARKERS_REGEX = /\[(выполнено|завершено|completed|done)\]/gi;

/**
 * Парсит сырую строку квеста в структурированный объект.
 * Изолирует хрупкую логику определения статуса в одном месте.
 *
 * @param rawQuest - Сырая строка от AI, например "[Выполнено] Найти меч"
 * @param index    - Позиция в массиве (для id и отладки)
 */
function parseQuest(rawQuest: string, index: number): ParsedQuest {
  const isCompleted = COMPLETED_MARKERS_REGEX.test(rawQuest);

  // Сбрасываем lastIndex — RegExp с флагом /g сохраняет состояние между вызовами!
  // Это классический баг с регулярками в JS.
  COMPLETED_MARKERS_REGEX.lastIndex = 0;

  const text = rawQuest
    .replace(COMPLETED_MARKERS_REGEX, '')
    .trim();

  // Сбрасываем снова после replace
  COMPLETED_MARKERS_REGEX.lastIndex = 0;

  // ID на основе содержимого — стабильнее индекса при изменении порядка
  const id = `quest-${index}-${text.slice(0, 20).replace(/\s+/g, '-')}`;

  return {
    id,
    text,
    isCompleted,
    originalIndex: index,
  };
}

// ─────────────────────────────────────────────
// Вспомогательные компоненты
// ─────────────────────────────────────────────

interface QuestItemProps {
  quest: ParsedQuest;
  isLight: boolean;
}

/**
 * Карточка одного квеста.
 * Вынесена из QuestTab чтобы:
 * 1. JSX родителя оставался читаемым
 * 2. React мог мемоизировать отдельные карточки при необходимости
 */
const QuestItem = React.memo(function QuestItem({ quest, isLight }: QuestItemProps) {
  const { text, isCompleted } = quest;

  return (
    <div
      className={cn(
        "group p-5 rounded-2xl border transition-all duration-300",
        isCompleted
          ? isLight
            ? "bg-neutral-100 border-neutral-200 opacity-60"
            : "bg-neutral-900/30 border-neutral-800/50 opacity-60"
          : isLight
          ? "bg-white border-orange-500/20 shadow-sm"
          : "bg-neutral-900/50 border-orange-500/20 hover:border-orange-500/40"
      )}
    >
      <div className="flex items-start gap-4">
        {/* Иконка статуса */}
        <div
          className={cn(
            "w-10 h-10 rounded-xl flex items-center justify-center border shrink-0 transition-colors",
            isCompleted
              ? "bg-green-500/10 border-green-500/20 text-green-500"
              : "bg-orange-500/10 border-orange-500/20 text-orange-500 group-hover:border-orange-500/40"
          )}
          aria-label={isCompleted ? "Квест завершён" : "Квест активен"}
        >
          {isCompleted ? <CheckCircle2 size={20} /> : <Flag size={20} />}
        </div>

        {/* Содержимое */}
        <div className="flex-1 min-w-0">
          {/* Строка с бейджем статуса и иконкой активности */}
          <div className="flex items-center justify-between mb-1">
            <span
              className={cn(
                "text-[10px] font-black uppercase tracking-[0.2em]",
                isCompleted ? "text-green-500/50" : "text-orange-500/70"
              )}
            >
              {isCompleted ? "Завершено" : "Активно"}
            </span>

            {/* Пульсирующая иконка только для активных квестов */}
            {!isCompleted && (
              <Sparkles
                size={12}
                className="text-orange-500/40 animate-pulse"
                aria-hidden="true"
              />
            )}
          </div>

          {/* Текст квеста */}
          <p
            className={cn(
              "text-base leading-relaxed break-words",
              isCompleted
                ? "text-neutral-500 line-through"
                : isLight
                ? "text-neutral-800 font-medium"
                : "text-neutral-200 font-medium"
            )}
          >
            {text}
          </p>
        </div>
      </div>
    </div>
  );
});

/**
 * Заглушка для пустого состояния — когда квестов нет.
 */
function EmptyQuestState() {
  return (
    <div className="h-full flex flex-col items-center justify-center text-center space-y-4 opacity-40">
      <div className="w-20 h-20 rounded-full bg-neutral-900 flex items-center justify-center border border-neutral-800">
        <Map size={40} className="text-neutral-600" aria-hidden="true" />
      </div>
      <div>
        <p className="text-neutral-500 font-medium italic">
          Активных заданий пока нет.
        </p>
        <p className="text-xs text-neutral-600 mt-1 uppercase tracking-widest">
          Исследуйте мир, чтобы найти приключения
        </p>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// Главный компонент
// ─────────────────────────────────────────────

export default function QuestTab({ quests, appSettings }: QuestTabProps) {
  const isLight = appSettings?.theme === 'light';

  /**
   * Трансформируем сырые строки в структурированные объекты один раз.
   * useMemo гарантирует что parseQuest не вызывается на каждый рендер —
   * только когда реально изменился массив quests.
   */
  const parsedQuests = useMemo<ParsedQuest[]>(() => {
    if (!quests || quests.length === 0) return [];
    return quests.map((rawQuest, index) => parseQuest(rawQuest, index));
  }, [quests]);

  // Разделяем активные и завершённые для правильного порядка отображения:
  // активные всегда сверху, завершённые — снизу
  const activeQuests = useMemo(
    () => parsedQuests.filter((q) => !q.isCompleted),
    [parsedQuests]
  );

  const completedQuests = useMemo(
    () => parsedQuests.filter((q) => q.isCompleted),
    [parsedQuests]
  );

  return (
    <div
      className={cn(
        "flex-1 flex flex-col min-h-0 overflow-hidden",
        isLight ? "bg-neutral-50" : "bg-black"
      )}
    >
      {/* Шапка */}
      <div className="p-6 border-b border-neutral-800/50 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-orange-500/10 flex items-center justify-center border border-orange-500/20">
            <ScrollText className="text-orange-500" size={24} aria-hidden="true" />
          </div>
          <div>
            <h3 className="text-lg font-bold font-display uppercase tracking-wider text-white">
              Журнал заданий
            </h3>
            <p className="text-xs text-neutral-500 uppercase tracking-widest font-medium">
              Ваши приключения
            </p>
          </div>
        </div>

        {/* Счётчик активных квестов */}
        {activeQuests.length > 0 && (
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-orange-500/10 border border-orange-500/20">
            <span className="text-xs font-bold text-orange-500">
              {activeQuests.length}
            </span>
            <span className="text-[10px] text-orange-500/70 uppercase tracking-wider">
              {activeQuests.length === 1 ? "задание" : "задания"}
            </span>
          </div>
        )}
      </div>

      {/* Список квестов */}
      <div className="flex-1 overflow-y-auto p-6">
        {parsedQuests.length === 0 ? (
          <EmptyQuestState />
        ) : (
          <div className="space-y-4">
            {/* Сначала активные */}
            {activeQuests.map((quest) => (
              <QuestItem key={quest.id} quest={quest} isLight={isLight} />
            ))}

            {/* Разделитель — только если есть и активные, и завершённые */}
            {activeQuests.length > 0 && completedQuests.length > 0 && (
              <div className="flex items-center gap-3 py-2">
                <div className="flex-1 h-px bg-neutral-800/50" />
                <span className="text-[10px] text-neutral-600 uppercase tracking-widest font-medium">
                  Завершено
                </span>
                <div className="flex-1 h-px bg-neutral-800/50" />
              </div>
            )}

            {/* Потом завершённые */}
            {completedQuests.map((quest) => (
              <QuestItem key={quest.id} quest={quest} isLight={isLight} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}