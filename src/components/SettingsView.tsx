// src/views/SettingsView.tsx

import React, { useState, useCallback, useMemo, memo } from 'react';
import type { AppSettings, ChatSettings } from '@/src/types';
import {
  X, Globe, MessageSquare, Monitor, Type,
  Palette, Zap, ShieldAlert, Trash2, Bug,
} from 'lucide-react';
import { cn } from '@/src/lib/utils';

// ─────────────────────────────────────────────
// Типы
// ─────────────────────────────────────────────

interface SettingsViewProps {
  appSettings: AppSettings;
  /**
   * Принимает updater-функцию ИЛИ новое значение.
   * Функциональная форма защищает от race condition при быстрых обновлениях.
   */
  setAppSettings: React.Dispatch<React.SetStateAction<AppSettings>>;
  chatSettings: ChatSettings;
  setChatSettings: React.Dispatch<React.SetStateAction<ChatSettings>>;
  onClose: () => void;
}

type SettingsTab = 'global' | 'chat';

// ─────────────────────────────────────────────
// Типы для helper-компонентов
// ─────────────────────────────────────────────

interface SectionProps {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  isLight: boolean;
}

interface SelectOption {
  value: string;
  label: string;
}

interface SelectFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  isLight: boolean;
}

interface ToggleFieldProps {
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
  isLight: boolean;
}

// ─────────────────────────────────────────────
// Утилиты
// ─────────────────────────────────────────────

/**
 * Определяет является ли тема "светлой".
 * Централизованная проверка — при добавлении новых тем меняем только здесь.
 * Темы 'dark' и 'black' обе считаются тёмными.
 */
function isLightTheme(theme: AppSettings['theme']): boolean {
  return theme === 'light';
}

/**
 * Валидирует URL для музыки.
 * Разрешаем только http/https — блокируем javascript: и data: схемы.
 */
function validateMusicUrl(url: string): { valid: boolean; error?: string } {
  if (!url || url.trim() === '') {
    return { valid: true }; // Пустой URL — допустимо (музыка отключена)
  }

  try {
    const parsed = new URL(url.trim());

    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      return {
        valid: false,
        error: 'Только ссылки http:// и https://',
      };
    }

    const allowedExtensions = ['.mp3', '.wav', '.ogg', '.aac', '.flac', '.m4a'];
    const hasAudioExtension = allowedExtensions.some((ext) =>
      parsed.pathname.toLowerCase().endsWith(ext)
    );

    if (!hasAudioExtension) {
      return {
        valid: false,
        error: 'Ссылка должна вести на аудиофайл (.mp3, .wav, .ogg и др.)',
      };
    }

    return { valid: true };
  } catch {
    return { valid: false, error: 'Некорректный URL' };
  }
}

/**
 * Реальная очистка кэша приложения.
 * Чистим localStorage, sessionStorage и Service Worker кэши.
 */
async function clearAppCache(): Promise<void> {
  // 1. Очищаем localStorage (настройки, токены кэша)
  // Supabase хранит сессию в localStorage — НЕ трогаем её
  const keysToPreserve = new Set<string>();
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith('sb-')) {
      // sb- префикс используют Supabase токены
      keysToPreserve.add(key);
    }
  }

  const allKeys: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key) allKeys.push(key);
  }

  allKeys.forEach((key) => {
    if (!keysToPreserve.has(key)) {
      localStorage.removeItem(key);
    }
  });

  // 2. Чистим sessionStorage полностью
  sessionStorage.clear();

  // 3. Чистим Service Worker кэши если доступны
  if ('caches' in window) {
    try {
      const cacheNames = await caches.keys();
      await Promise.all(cacheNames.map((name) => caches.delete(name)));
    } catch (err) {
      console.warn('[SettingsView] Не удалось очистить SW кэши:', err);
    }
  }
}

// ─────────────────────────────────────────────
// Helper-компоненты (мемоизированы)
// ─────────────────────────────────────────────

/**
 * Секция настроек с заголовком и иконкой.
 * Принимает isLight вместо всего appSettings — минимальная связанность.
 */
const Section = memo(function Section({
  title,
  icon,
  children,
  isLight,
}: SectionProps) {
  return (
    <div className="space-y-4">
      <h3
        className={cn(
          'text-lg font-bold tracking-tight flex items-center gap-3 pb-3 border-b',
          isLight ? 'text-neutral-900 border-neutral-200' : 'text-white border-neutral-800'
        )}
      >
        <span className="text-orange-500 bg-orange-500/10 p-2 rounded-xl" aria-hidden="true">
          {icon}
        </span>
        {title}
      </h3>
      <div className="space-y-4">{children}</div>
    </div>
  );
});

/**
 * Поле выбора (select).
 * Связывает label с select через htmlFor/id для accessibility.
 */
const SelectField = memo(function SelectField({
  label,
  value,
  onChange,
  options,
  isLight,
}: SelectFieldProps) {
  // Генерируем стабильный id из label
  const fieldId = `select-${label.replace(/\s+/g, '-').toLowerCase()}`;

  return (
    <div
      className={cn(
        'flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 border rounded-2xl',
        isLight
          ? 'bg-white border-neutral-200 shadow-sm'
          : 'bg-neutral-950 border-neutral-800'
      )}
    >
      <label
        htmlFor={fieldId}
        className={cn(
          'text-base font-bold',
          isLight ? 'text-neutral-700' : 'text-neutral-300'
        )}
      >
        {label}
      </label>
      <select
        id={fieldId}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          'border text-base rounded-xl px-4 py-3 outline-none',
          'focus:border-orange-500 transition-colors cursor-pointer',
          isLight
            ? 'bg-neutral-50 border-neutral-200 text-neutral-900'
            : 'bg-neutral-900 border-neutral-700 text-white'
        )}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
});

/**
 * Поле переключателя (toggle).
 * Использует role="switch" и aria-checked для screen readers.
 * Нативный checkbox скрыт, кастомный визуал доступен.
 */
const ToggleField = memo(function ToggleField({
  label,
  value,
  onChange,
  isLight,
}: ToggleFieldProps) {
  const fieldId = `toggle-${label.replace(/\s+/g, '-').toLowerCase()}`;

  return (
    <label
      htmlFor={fieldId}
      className={cn(
        'flex items-center justify-between p-4 border rounded-2xl cursor-pointer transition-colors group',
        isLight
          ? 'bg-white border-neutral-200 hover:border-neutral-300 shadow-sm'
          : 'bg-neutral-950 border-neutral-800 hover:border-neutral-700'
      )}
    >
      {/* Скрытый нативный checkbox — для accessibility */}
      <input
        id={fieldId}
        type="checkbox"
        checked={value}
        onChange={(e) => onChange(e.target.checked)}
        className="sr-only"
        role="switch"
        aria-checked={value}
      />

      <span
        className={cn(
          'text-base font-bold transition-colors',
          isLight
            ? 'text-neutral-700 group-hover:text-neutral-900'
            : 'text-neutral-300 group-hover:text-white'
        )}
      >
        {label}
      </span>

      {/* Визуальный переключатель — aria-hidden, настоящий контрол выше */}
      <div
        aria-hidden="true"
        className={cn(
          'w-14 h-7 rounded-full transition-colors relative shrink-0',
          value ? 'bg-orange-500' : isLight ? 'bg-neutral-300' : 'bg-neutral-700'
        )}
      >
        <div
          className={cn(
            'absolute top-1 left-1 w-5 h-5 rounded-full bg-white transition-transform shadow-sm',
            value ? 'translate-x-7' : 'translate-x-0'
          )}
        />
      </div>
    </label>
  );
});

// ─────────────────────────────────────────────
// Главный компонент
// ─────────────────────────────────────────────

export default function SettingsView({
  appSettings,
  setAppSettings,
  chatSettings,
  setChatSettings,
  onClose,
}: SettingsViewProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>('global');
  const [musicUrlError, setMusicUrlError] = useState<string | null>(null);
  const [isClearingCache, setIsClearingCache] = useState(false);
  const [cacheCleared, setCacheCleared] = useState(false);

  const isLight = isLightTheme(appSettings.theme);

  /**
   * Типобезопасное обновление AppSettings.
   * Используем функциональный updater — защита от stale closure.
   * Generic K гарантирует что value соответствует типу поля.
   */
  const updateApp = useCallback(
    <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
      setAppSettings((prev) => ({ ...prev, [key]: value }));
    },
    [setAppSettings]
  );

  /**
   * Типобезопасное обновление ChatSettings.
   */
  const updateChat = useCallback(
    <K extends keyof ChatSettings>(key: K, value: ChatSettings[K]) => {
      setChatSettings((prev) => ({ ...prev, [key]: value }));
    },
    [setChatSettings]
  );

  /**
   * Обработчик изменения URL музыки с валидацией.
   */
  const handleMusicUrlChange = useCallback(
    (url: string) => {
      const validation = validateMusicUrl(url);

      if (validation.valid) {
        setMusicUrlError(null);
        updateApp('localMusicUrl', url);
      } else {
        setMusicUrlError(validation.error ?? null);
        // Всё равно обновляем значение в поле — пользователь должен видеть что печатает
        updateApp('localMusicUrl', url);
      }
    },
    [updateApp]
  );

  /**
   * Реальная очистка кэша с подтверждением и фидбеком.
   */
  const handleClearCache = useCallback(async () => {
    const confirmed = window.confirm(
      'Очистить кэш приложения?\n\nСессия входа сохранится. Настройки будут сброшены.'
    );

    if (!confirmed) return;

    setIsClearingCache(true);
    try {
      await clearAppCache();
      setCacheCleared(true);

      // Даём пользователю увидеть результат перед перезагрузкой
      setTimeout(() => {
        window.location.reload();
      }, 1500);
    } catch (err) {
      console.error('[SettingsView] Ошибка очистки кэша:', err);
      setIsClearingCache(false);
    }
  }, []);

  // Классы для табов — мемоизируем чтобы не пересчитывать на каждый рендер
  const getTabClasses = useCallback(
    (tab: SettingsTab) =>
      cn(
        'px-6 py-4 text-sm font-bold uppercase tracking-wider rounded-t-xl',
        'transition-colors flex items-center gap-2',
        'focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-inset',
        activeTab === tab
          ? isLight
            ? 'bg-neutral-100 text-neutral-900'
            : 'bg-neutral-900 text-white'
          : isLight
          ? 'text-neutral-500 hover:text-neutral-700'
          : 'text-neutral-500 hover:text-neutral-300'
      ),
    [activeTab, isLight]
  );

  return (
    <div
      className={cn(
        'flex-1 flex flex-col h-full overflow-hidden',
        isLight ? 'bg-neutral-50' : 'bg-black'
      )}
    >
      {/* Шапка */}
      <div
        className={cn(
          'flex-none p-6 border-b flex justify-between items-center',
          isLight
            ? 'bg-white border-neutral-200'
            : 'bg-neutral-950 border-neutral-900'
        )}
      >
        <div>
          <h2
            className={cn(
              'text-2xl font-bold font-display tracking-tight',
              isLight ? 'text-neutral-900' : 'text-white'
            )}
          >
            Настройки
          </h2>
          <p className="text-xs text-neutral-500 font-medium uppercase tracking-widest mt-1">
            Конфигурация системы
          </p>
        </div>

        <button
          onClick={onClose}
          aria-label="Закрыть настройки"
          className={cn(
            'p-3 rounded-2xl transition-all',
            'focus:outline-none focus:ring-2 focus:ring-orange-500',
            isLight
              ? 'text-neutral-400 hover:text-neutral-900 hover:bg-neutral-100'
              : 'text-neutral-500 hover:text-white hover:bg-neutral-900'
          )}
        >
          <X size={24} aria-hidden="true" />
        </button>
      </div>

      {/* Табы */}
      <div
        className={cn(
          'flex-none px-6 pt-4 flex gap-2 border-b',
          isLight
            ? 'bg-white border-neutral-200'
            : 'bg-neutral-950 border-neutral-900'
        )}
        role="tablist"
        aria-label="Разделы настроек"
      >
        <button
          role="tab"
          aria-selected={activeTab === 'global'}
          aria-controls="tab-panel-global"
          onClick={() => setActiveTab('global')}
          className={getTabClasses('global')}
        >
          <Globe size={18} aria-hidden="true" />
          Общие
        </button>
        <button
          role="tab"
          aria-selected={activeTab === 'chat'}
          aria-controls="tab-panel-chat"
          onClick={() => setActiveTab('chat')}
          className={getTabClasses('chat')}
        >
          <MessageSquare size={18} aria-hidden="true" />
          Чат
        </button>
      </div>

      {/* Контент */}
      <div
        className={cn(
          'flex-1 overflow-y-auto p-6',
          isLight ? 'bg-neutral-50' : 'bg-neutral-900/30'
        )}
      >
        <div className="max-w-3xl mx-auto space-y-8 pb-12">

          {/* ── Вкладка: Общие ── */}
          {activeTab === 'global' && (
            <div
              id="tab-panel-global"
              role="tabpanel"
              aria-label="Общие настройки"
              className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-300"
            >
              {/* Геймплей */}
              <Section
                title="Геймплей и Атмосфера"
                icon={<ShieldAlert size={18} />}
                isLight={isLight}
              >
                <SelectField
                  label="Тон Гейм-мастера"
                  value={appSettings.gmTone ?? 'classic'}
                  onChange={(v) => updateApp('gmTone', v as AppSettings['gmTone'])}
                  options={[
                    { value: 'classic', label: 'Классическое фэнтези' },
                    { value: 'grimdark', label: 'Гримдарк (Мрачное)' },
                    { value: 'horror', label: 'Лавкрафтовский ужас' },
                    { value: 'epic', label: 'Эпическая сага' },
                  ]}
                  isLight={isLight}
                />
                <SelectField
                  label="Сложность"
                  value={appSettings.difficulty ?? 'normal'}
                  onChange={(v) => updateApp('difficulty', v as AppSettings['difficulty'])}
                  options={[
                    { value: 'normal', label: 'Нормальная (Сбалансированная)' },
                    { value: 'hard', label: 'Высокая (Сложная)' },
                    { value: 'hardcore', label: 'Хардкор (Смертельная)' },
                  ]}
                  isLight={isLight}
                />
                <SelectField
                  label="Уровень жестокости (Gore)"
                  value={appSettings.goreLevel}
                  onChange={(v) => updateApp('goreLevel', v as AppSettings['goreLevel'])}
                  options={[
                    { value: 'low', label: 'Низкий (PG-13)' },
                    { value: 'medium', label: 'Средний (Стандарт)' },
                    { value: 'high', label: 'Высокий (Рейтинг R)' },
                  ]}
                  isLight={isLight}
                />
              </Section>

              {/* Интерфейс */}
              <Section
                title="Интерфейс"
                icon={<Monitor size={18} />}
                isLight={isLight}
              >
                <SelectField
                  label="Тема приложения"
                  value={appSettings.theme}
                  onChange={(v) => updateApp('theme', v as AppSettings['theme'])}
                  options={[
                    { value: 'light', label: 'Светлая' },
                    { value: 'dark', label: 'Тёмная' },
                    { value: 'black', label: 'Фулл Блэк (OLED)' },
                  ]}
                  isLight={isLight}
                />
                <SelectField
                  label="Язык интерфейса"
                  value={appSettings.language}
                  onChange={(v) => updateApp('language', v as AppSettings['language'])}
                  options={[
                    { value: 'ru', label: 'Русский' },
                    { value: 'en', label: 'English' },
                  ]}
                  isLight={isLight}
                />
              </Section>

              {/* Эффекты */}
              <Section
                title="Эффекты и Обратная связь"
                icon={<Zap size={18} />}
                isLight={isLight}
              >
                <ToggleField
                  label="Звуковые эффекты"
                  value={appSettings.soundEffects}
                  onChange={(v) => updateApp('soundEffects', v)}
                  isLight={isLight}
                />
                <ToggleField
                  label="Вибрация (Haptic)"
                  value={appSettings.vibration}
                  onChange={(v) => updateApp('vibration', v)}
                  isLight={isLight}
                />
                <ToggleField
                  label="Анимации интерфейса"
                  value={appSettings.animations}
                  onChange={(v) => updateApp('animations', v)}
                  isLight={isLight}
                />
                <ToggleField
                  label="Режим производительности"
                  value={appSettings.performanceMode}
                  onChange={(v) => updateApp('performanceMode', v)}
                  isLight={isLight}
                />

                {/* Поле URL музыки */}
                <div
                  className={cn(
                    'flex flex-col gap-3 p-4 border rounded-2xl',
                    isLight
                      ? 'bg-white border-neutral-200 shadow-sm'
                      : 'bg-neutral-950 border-neutral-800'
                  )}
                >
                  <label
                    htmlFor="music-url"
                    className={cn(
                      'text-base font-bold',
                      isLight ? 'text-neutral-700' : 'text-neutral-300'
                    )}
                  >
                    Локальная фоновая музыка (URL)
                  </label>
                  <p className="text-xs text-neutral-500">
                    Вставьте прямую ссылку на аудиофайл (.mp3, .wav, .ogg),
                    чтобы он играл на фоне только для вас.
                  </p>
                  <input
                    id="music-url"
                    type="url"
                    value={appSettings.localMusicUrl ?? ''}
                    onChange={(e) => handleMusicUrlChange(e.target.value)}
                    placeholder="https://example.com/music.mp3"
                    aria-describedby={musicUrlError ? 'music-url-error' : undefined}
                    aria-invalid={musicUrlError ? 'true' : 'false'}
                    className={cn(
                      'w-full border text-base rounded-xl px-4 py-3',
                      'outline-none focus:border-orange-500 transition-colors',
                      isLight
                        ? 'bg-neutral-50 border-neutral-200 text-neutral-900'
                        : 'bg-neutral-900 border-neutral-700 text-white',
                      musicUrlError && 'border-red-500 focus:border-red-500'
                    )}
                  />
                  {musicUrlError && (
                    <p
                      id="music-url-error"
                      className="text-xs text-red-500"
                      role="alert"
                    >
                      {musicUrlError}
                    </p>
                  )}
                </div>
              </Section>

              {/* Система */}
              <Section
                title="Система"
                icon={<Bug size={18} />}
                isLight={isLight}
              >
                <button
                  onClick={handleClearCache}
                  disabled={isClearingCache || cacheCleared}
                  className={cn(
                    'w-full flex items-center justify-between p-4 rounded-2xl border',
                    'transition-colors group',
                    'focus:outline-none focus:ring-2 focus:ring-red-500',
                    'disabled:opacity-50 disabled:cursor-not-allowed',
                    isLight
                      ? 'bg-white border-neutral-200 hover:border-red-500/50 shadow-sm'
                      : 'bg-neutral-950 border-neutral-800 hover:border-red-500/50'
                  )}
                  aria-label="Очистить кэш данных приложения"
                >
                  <div className="flex items-center gap-3">
                    <Trash2
                      size={20}
                      className={cn(
                        'transition-colors',
                        cacheCleared
                          ? 'text-green-500'
                          : 'text-neutral-500 group-hover:text-red-500'
                      )}
                      aria-hidden="true"
                    />
                    <span
                      className={cn(
                        'text-base font-bold transition-colors',
                        cacheCleared
                          ? 'text-green-500'
                          : isLight
                          ? 'text-neutral-700 group-hover:text-red-500'
                          : 'text-neutral-300 group-hover:text-red-500'
                      )}
                    >
                      {cacheCleared
                        ? 'Кэш очищен, перезагрузка...'
                        : isClearingCache
                        ? 'Очистка...'
                        : 'Очистить кэш данных'}
                    </span>
                  </div>
                  {!cacheCleared && (
                    <span className="text-[10px] text-neutral-500 uppercase tracking-widest font-bold">
                      Сброс
                    </span>
                  )}
                </button>
              </Section>

              {/* Версия */}
              <div className="pt-12 pb-4 flex flex-col items-center justify-center text-neutral-500 space-y-2">
                <div
                  className={cn(
                    'w-12 h-12 rounded-2xl flex items-center justify-center mb-2',
                    isLight ? 'bg-neutral-200' : 'bg-neutral-900'
                  )}
                >
                  <Zap
                    size={24}
                    className={isLight ? 'text-neutral-400' : 'text-neutral-700'}
                    aria-hidden="true"
                  />
                </div>
                <p className="text-sm font-bold tracking-widest uppercase">NeuroRPG</p>
                <p className="text-xs font-mono">Версия 0.3.0 (Build 42)</p>
              </div>
            </div>
          )}

          {/* ── Вкладка: Чат ── */}
          {activeTab === 'chat' && (
            <div
              id="tab-panel-chat"
              role="tabpanel"
              aria-label="Настройки чата"
              className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-300"
            >
              {/* Типографика */}
              <Section
                title="Типографика и Текст"
                icon={<Type size={18} />}
                isLight={isLight}
              >
                <SelectField
                  label="Семейство шрифтов"
                  value={chatSettings.fontFamily}
                  onChange={(v) => updateChat('fontFamily', v as ChatSettings['fontFamily'])}
                  options={[
                    { value: 'sans', label: 'Modern (Sans)' },
                    { value: 'serif', label: 'Classic (Serif)' },
                    { value: 'mono', label: 'Technical (Mono)' },
                    { value: 'dyslexic', label: 'OpenDyslexic' },
                  ]}
                  isLight={isLight}
                />
                <SelectField
                  label="Размер шрифта"
                  value={chatSettings.fontSize}
                  onChange={(v) => updateChat('fontSize', v as ChatSettings['fontSize'])}
                  options={[
                    { value: 'sm', label: 'Мелкий' },
                    { value: 'md', label: 'Средний' },
                    { value: 'lg', label: 'Крупный' },
                  ]}
                  isLight={isLight}
                />
                <div className="grid grid-cols-2 gap-4">
                  <SelectField
                    label="Высота строки"
                    value={chatSettings.lineHeight}
                    onChange={(v) => updateChat('lineHeight', v as ChatSettings['lineHeight'])}
                    options={[
                      { value: 'tight', label: 'Плотная' },
                      { value: 'normal', label: 'Обычная' },
                      { value: 'loose', label: 'Свободная' },
                    ]}
                    isLight={isLight}
                  />
                  <SelectField
                    label="Интервал букв"
                    value={chatSettings.tracking}
                    onChange={(v) => updateChat('tracking', v as ChatSettings['tracking'])}
                    options={[
                      { value: 'tight', label: 'Узкий' },
                      { value: 'normal', label: 'Обычный' },
                      { value: 'wide', label: 'Широкий' },
                    ]}
                    isLight={isLight}
                  />
                </div>
                <SelectField
                  label="Выравнивание текста"
                  value={chatSettings.textAlign}
                  onChange={(v) => updateChat('textAlign', v as ChatSettings['textAlign'])}
                  options={[
                    { value: 'left', label: 'По левому краю' },
                    { value: 'justify', label: 'По ширине' },
                  ]}
                  isLight={isLight}
                />
                <div className="space-y-2 pt-2">
                  <ToggleField
                    label="Выделять имена жирным"
                    value={chatSettings.boldNames}
                    onChange={(v) => updateChat('boldNames', v)}
                    isLight={isLight}
                  />
                  <ToggleField
                    label="Действия курсивом"
                    value={chatSettings.italicActions}
                    onChange={(v) => updateChat('italicActions', v)}
                    isLight={isLight}
                  />
                  <ToggleField
                    label="Подсветка ключевых слов (лут, места)"
                    value={chatSettings.highlightKeywords}
                    onChange={(v) => updateChat('highlightKeywords', v)}
                    isLight={isLight}
                  />
                  <ToggleField
                    label="Авто-капитализация"
                    value={chatSettings.autoCapitalize}
                    onChange={(v) => updateChat('autoCapitalize', v)}
                    isLight={isLight}
                  />
                  <ToggleField
                    label="Поддержка Markdown"
                    value={chatSettings.enableMarkdown}
                    onChange={(v) => updateChat('enableMarkdown', v)}
                    isLight={isLight}
                  />
                </div>
              </Section>

              {/* Отображение сообщений */}
              <Section
                title="Отображение сообщений"
                icon={<MessageSquare size={18} />}
                isLight={isLight}
              >
                <SelectField
                  label="Стиль сообщений"
                  value={chatSettings.messageStyle}
                  onChange={(v) => updateChat('messageStyle', v as ChatSettings['messageStyle'])}
                  options={[
                    { value: 'bubbles', label: 'Облачка (Мессенджер)' },
                    { value: 'plain', label: 'Сплошной текст (Книга)' },
                  ]}
                  isLight={isLight}
                />
                <SelectField
                  label="Размер аватарок"
                  value={chatSettings.avatarSize}
                  onChange={(v) => updateChat('avatarSize', v as ChatSettings['avatarSize'])}
                  options={[
                    { value: 'hidden', label: 'Скрыты' },
                    { value: 'sm', label: 'Маленькие' },
                    { value: 'md', label: 'Средние' },
                    { value: 'lg', label: 'Большие' },
                  ]}
                  isLight={isLight}
                />
                <div className="space-y-2 pt-2">
                  <ToggleField
                    label="Компактный режим"
                    value={chatSettings.compactMode}
                    onChange={(v) => updateChat('compactMode', v)}
                    isLight={isLight}
                  />
                  <ToggleField
                    label="Показывать время (Timestamps)"
                    value={chatSettings.showTimestamps}
                    onChange={(v) => updateChat('showTimestamps', v)}
                    isLight={isLight}
                  />
                  <ToggleField
                    label="Скрыть системные сообщения"
                    value={chatSettings.hideSystemMessages}
                    onChange={(v) => updateChat('hideSystemMessages', v)}
                    isLight={isLight}
                  />
                </div>
              </Section>

              {/* Цвета */}
              <Section
                title="Цвета и Оформление"
                icon={<Palette size={18} />}
                isLight={isLight}
              >
                <SelectField
                  label="Цвет текста ИИ"
                  value={chatSettings.aiTextColor}
                  onChange={(v) => updateChat('aiTextColor', v as ChatSettings['aiTextColor'])}
                  options={[
                    { value: 'default', label: 'Стандартный' },
                    { value: 'gold', label: 'Золотой (Эпос)' },
                    { value: 'purple', label: 'Фиолетовый (Мистика)' },
                    { value: 'green', label: 'Зелёный (Яд/Хоррор)' },
                  ]}
                  isLight={isLight}
                />
                <div className="grid grid-cols-2 gap-4">
                  <SelectField
                    label="Стиль границ"
                    value={chatSettings.borderStyle}
                    onChange={(v) => updateChat('borderStyle', v as ChatSettings['borderStyle'])}
                    options={[
                      { value: 'sharp', label: 'Острые' },
                      { value: 'rounded', label: 'Скруглённые' },
                      { value: 'fantasy', label: 'Фэнтези рамки' },
                    ]}
                    isLight={isLight}
                  />
                  <SelectField
                    label="Интенсивность теней"
                    value={chatSettings.shadowIntensity}
                    onChange={(v) =>
                      updateChat('shadowIntensity', v as ChatSettings['shadowIntensity'])
                    }
                    options={[
                      { value: 'none', label: 'Плоский дизайн' },
                      { value: 'sm', label: 'Лёгкие' },
                      { value: 'md', label: 'Средние' },
                      { value: 'lg', label: 'Глубокие' },
                    ]}
                    isLight={isLight}
                  />
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <SelectField
                    label="Цвет ссылок"
                    value={chatSettings.linkColor}
                    onChange={(v) => updateChat('linkColor', v as ChatSettings['linkColor'])}
                    options={[
                      { value: 'blue', label: 'Синий' },
                      { value: 'orange', label: 'Оранжевый' },
                      { value: 'purple', label: 'Пурпурный' },
                    ]}
                    isLight={isLight}
                  />
                  <SelectField
                    label="Цвет шёпота"
                    value={chatSettings.whisperColor}
                    onChange={(v) => updateChat('whisperColor', v as ChatSettings['whisperColor'])}
                    options={[
                      { value: 'gray', label: 'Серый' },
                      { value: 'purple', label: 'Пурпурный' },
                      { value: 'blue', label: 'Синий' },
                    ]}
                    isLight={isLight}
                  />
                  <SelectField
                    label="Цвет ошибок"
                    value={chatSettings.errorColor}
                    onChange={(v) => updateChat('errorColor', v as ChatSettings['errorColor'])}
                    options={[
                      { value: 'red', label: 'Красный' },
                      { value: 'orange', label: 'Оранжевый' },
                    ]}
                    isLight={isLight}
                  />
                </div>
                <div className="space-y-2 pt-2">
                  <ToggleField
                    label="Цветовое кодирование игроков"
                    value={chatSettings.playerColors}
                    onChange={(v) => updateChat('playerColors', v)}
                    isLight={isLight}
                  />
                </div>
              </Section>

              {/* Взаимодействие */}
              <Section
                title="Взаимодействие и Поведение"
                icon={<Zap size={18} />}
                isLight={isLight}
              >
                {/* Слайдер скорости печати */}
                <div
                  className={cn(
                    'p-4 border rounded-2xl',
                    isLight
                      ? 'bg-white border-neutral-200 shadow-sm'
                      : 'bg-neutral-950 border-neutral-800'
                  )}
                >
                  <div className="flex justify-between items-center mb-4">
                    <label
                      htmlFor="typewriter-speed"
                      className={cn(
                        'text-sm font-bold',
                        isLight ? 'text-neutral-700' : 'text-neutral-200'
                      )}
                    >
                      Скорость печатной машинки
                    </label>
                    <span className="text-xs font-mono text-orange-500 bg-orange-500/10 px-2 py-1 rounded-md">
                      {chatSettings.typewriterSpeed === 0
                        ? 'Мгновенно'
                        : `${chatSettings.typewriterSpeed} мс`}
                    </span>
                  </div>
                  <input
                    id="typewriter-speed"
                    type="range"
                    min="0"
                    max="100"
                    step="10"
                    value={chatSettings.typewriterSpeed}
                    onChange={(e) =>
                      updateChat('typewriterSpeed', parseInt(e.target.value, 10))
                    }
                    aria-label={`Скорость печатной машинки: ${chatSettings.typewriterSpeed === 0 ? 'Мгновенно' : `${chatSettings.typewriterSpeed} мс`}`}
                    className={cn(
                      'w-full accent-orange-500 h-2 rounded-lg appearance-none cursor-pointer',
                      isLight ? 'bg-neutral-200' : 'bg-neutral-800'
                    )}
                  />
                </div>

                <div className="space-y-2 pt-2">
                  <ToggleField
                    label="Автоскролл к новым сообщениям"
                    value={chatSettings.autoScroll}
                    onChange={(v) => updateChat('autoScroll', v)}
                    isLight={isLight}
                  />
                  <ToggleField
                    label="Плавная прокрутка (Smooth scroll)"
                    value={chatSettings.smoothScroll}
                    onChange={(v) => updateChat('smoothScroll', v)}
                    isLight={isLight}
                  />
                  <ToggleField
                    label="Режим фокуса (затемнять старые сообщения)"
                    value={chatSettings.focusMode}
                    onChange={(v) => updateChat('focusMode', v)}
                    isLight={isLight}
                  />
                </div>
              </Section>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}