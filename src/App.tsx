// src/App.tsx

import { useEffect, useState, useCallback, useRef } from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { signInWithGoogle, logout } from './supabase';
import Lobby from '@/src/components/Lobby';
import RoomView from '@/src/components/RoomView';
import BestiaryView from '@/src/components/BestiaryView';
import SettingsView from '@/src/components/SettingsView';
import ErrorBoundary from '@/src/components/ErrorBoundary';
import {
  LogOut,
  BookOpen,
  Home,
  DoorOpen,
  MoreVertical,
  Settings,
  Bug,
  X,
  Send,
  CheckCircle2,
  Loader2,
} from 'lucide-react';
import { ConfirmModal } from './components/ConfirmModal';
import type { AppSettings, ChatSettings } from './types';
import { cn } from '@/src/lib/utils';

// ─────────────────────────────────────────────
// Типы
// ─────────────────────────────────────────────

type ViewState = 'main' | 'bestiary' | 'settings';
type ReportType = 'bug' | 'suggestion' | 'typo';

// ─────────────────────────────────────────────
// Константы
// ─────────────────────────────────────────────

const APP_VERSION = '0.3.0';

/**
 * Дефолтные настройки приложения.
 * Используются при первом запуске или если localStorage повреждён.
 */
const DEFAULT_APP_SETTINGS: AppSettings = {
  goreLevel: 'medium',
  gmTone: 'classic',
  difficulty: 'normal',
  theme: 'dark',
  language: 'ru',
  soundEffects: true,
  vibration: true,
  animations: true,
  performanceMode: false,
  localMusicUrl: '',
};

const DEFAULT_CHAT_SETTINGS: ChatSettings = {
  fontFamily: 'sans',
  fontSize: 'md',
  lineHeight: 'normal',
  tracking: 'normal',
  boldNames: true,
  italicActions: true,
  highlightKeywords: false,
  textAlign: 'left',
  autoCapitalize: true,
  typewriterSpeed: 30,
  messageStyle: 'bubbles',
  compactMode: false,
  showTimestamps: true,
  avatarSize: 'md',
  hideSystemMessages: false,
  playerColors: true,
  aiTextColor: 'default',
  borderStyle: 'rounded',
  shadowIntensity: 'sm',
  linkColor: 'blue',
  whisperColor: 'gray',
  errorColor: 'red',
  autoScroll: true,
  smoothScroll: true,
  enableMarkdown: true,
  focusMode: false,
};

// ─────────────────────────────────────────────
// Утилиты
// ─────────────────────────────────────────────

/**
 * Безопасно читает JSON из localStorage.
 * При SyntaxError или несоответствии схемы — возвращает defaults.
 * Мёрджит defaults с сохранёнными данными — новые поля не теряются.
 *
 * @param key - Ключ в localStorage
 * @param defaults - Значения по умолчанию (определяют схему)
 */
function safeLoadFromStorage<T extends Record<string, unknown>>(
  key: string,
  defaults: T
): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return defaults;

    const parsed = JSON.parse(raw);

    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      console.warn(`[Storage] Битые данные в ключе "${key}", используем defaults`);
      return defaults;
    }

    // Мёрджим с defaults — новые поля схемы получают значения по умолчанию
    return { ...defaults, ...parsed };
  } catch (err) {
    console.warn(`[Storage] Ошибка парсинга ключа "${key}":`, err);
    return defaults;
  }
}

/**
 * Возвращает CSS-класс для темы документа.
 */
function getThemeBodyClass(theme: AppSettings['theme']): string | null {
  switch (theme) {
    case 'light': return 'light-theme';
    case 'black': return 'black-theme';
    default: return null; // 'dark' — базовая тема, без класса
  }
}

// ─────────────────────────────────────────────
// Вспомогательные компоненты
// ─────────────────────────────────────────────

interface LoginScreenProps {
  onSignIn: () => Promise<void>;
  isSigningIn: boolean;
  authError: string | null;
  onOpenReport: () => void;
}

/**
 * Экран входа — вынесен из App для читаемости.
 * Показывается неавторизованным пользователям.
 */
function LoginScreen({ onSignIn, isSigningIn, authError, onOpenReport }: LoginScreenProps) {
  return (
    <div className="min-h-[100dvh] bg-black flex items-center justify-center">
      <div className="w-full max-w-md h-[100dvh] bg-black flex flex-col items-center justify-center p-8 text-neutral-100 overflow-hidden relative border-x border-neutral-900 shadow-2xl">
        <div className="flex flex-col items-center justify-center w-full space-y-12 text-center max-w-xs">

          {/* Логотип */}
          <div className="space-y-4">
            <div className="w-24 h-24 bg-orange-600 rounded-[2.5rem] mx-auto flex items-center justify-center shadow-2xl shadow-orange-600/20 rotate-3 animate-in zoom-in duration-500">
              <span className="text-5xl font-black text-white">N</span>
            </div>
            <div className="space-y-2">
              <h1 className="text-5xl font-bold tracking-tighter text-white font-display pt-4">
                NeuroRPG
              </h1>
              <p className="text-neutral-500 text-sm font-medium uppercase tracking-[0.2em]">
                Цифровой Гейм-мастер
              </p>
            </div>
          </div>

          {/* Кнопка входа */}
          <div className="w-full space-y-4">
            {authError && (
              <div
                className="bg-red-500/10 border border-red-500/20 text-red-400 text-xs p-3 rounded-xl text-left animate-in fade-in slide-in-from-bottom-2"
                role="alert"
              >
                {authError}
              </div>
            )}

            <button
              onClick={onSignIn}
              disabled={isSigningIn}
              className="w-full flex items-center justify-center gap-4 px-4 py-5 border border-transparent text-lg font-bold rounded-3xl text-black bg-white hover:bg-neutral-200 transition-all active:scale-95 shadow-2xl shadow-white/5 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-2 focus:ring-offset-black"
            >
              {isSigningIn ? (
                <Loader2 className="w-6 h-6 animate-spin" aria-hidden="true" />
              ) : (
                <img
                  src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg"
                  className="w-6 h-6"
                  alt=""
                  aria-hidden="true"
                />
              )}
              {isSigningIn ? 'Вход...' : 'Войти через Google'}
            </button>

            <p className="text-[10px] text-neutral-600 font-medium uppercase tracking-widest leading-relaxed">
              Авторизация необходима для сохранения <br /> твоего прогресса и персонажей
            </p>
          </div>

          {/* Кнопка репорта для неавторизованных */}
          <button
            onClick={onOpenReport}
            className="text-neutral-700 hover:text-neutral-500 text-xs uppercase tracking-widest transition-colors flex items-center gap-2"
          >
            <Bug size={12} aria-hidden="true" />
            Сообщить о проблеме
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// Report Modal — единый компонент для всех случаев
// ─────────────────────────────────────────────

interface ReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: User | null;
  currentRoomId: string | null;
  isLight: boolean;
}

function ReportModal({ isOpen, onClose, user, currentRoomId, isLight }: ReportModalProps) {
  const [reportType, setReportType] = useState<ReportType>('bug');
  const [reportMessage, setReportMessage] = useState('');
  const [isReporting, setIsReporting] = useState(false);
  const [reportSuccess, setReportSuccess] = useState(false);

  // Сбрасываем состояние при закрытии
  const handleClose = useCallback(() => {
    onClose();
    // Небольшая задержка чтобы анимация закрытия прошла до сброса
    setTimeout(() => {
      setReportMessage('');
      setReportSuccess(false);
      setReportType('bug');
    }, 300);
  }, [onClose]);

  const handleSendReport = useCallback(async () => {
    if (!reportMessage.trim()) return;

    setIsReporting(true);

    try {
      // Получаем токен для авторизованных пользователей
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      if (user) {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          headers['Authorization'] = `Bearer ${session.access_token}`;
        }
      }

      const response = await fetch('/api/report', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          type: reportType,
          message: reportMessage.trim(),
          userEmail: user?.email ?? 'anonymous',
          roomId: currentRoomId,
          version: APP_VERSION,
        }),
      });

      if (response.ok) {
        setReportSuccess(true);
        setReportMessage('');
        setTimeout(() => {
          setReportSuccess(false);
          handleClose();
        }, 3000);
      } else {
        console.error('[Report] Сервер вернул ошибку:', response.status);
      }
    } catch (err) {
      console.error('[Report] Ошибка отправки:', err);
    } finally {
      setIsReporting(false);
    }
  }, [reportMessage, reportType, user, currentRoomId, handleClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 bg-black/80 backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      aria-label="Форма обратной связи"
    >
      <div
        className={cn(
          'w-full max-w-sm rounded-3xl shadow-2xl overflow-hidden',
          isLight
            ? 'bg-white border border-neutral-200'
            : 'bg-neutral-950 border border-neutral-800'
        )}
      >
        {/* Шапка */}
        <div
          className={cn(
            'p-6 border-b flex justify-between items-center',
            isLight ? 'border-neutral-200' : 'border-neutral-900 bg-neutral-900/30'
          )}
        >
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-orange-500/10 text-orange-500 rounded-xl border border-orange-500/20">
              <Bug size={20} aria-hidden="true" />
            </div>
            <div>
              <h3
                className={cn(
                  'text-lg font-bold tracking-tight',
                  isLight ? 'text-neutral-900' : 'text-white'
                )}
              >
                Обратная связь
              </h3>
              <p className="text-xs text-neutral-500 font-medium uppercase tracking-widest mt-0.5">
                Нашли баг или есть идея?
              </p>
            </div>
          </div>
          <button
            onClick={handleClose}
            aria-label="Закрыть"
            className={cn(
              'p-2 rounded-xl transition-colors',
              isLight
                ? 'text-neutral-400 hover:text-neutral-900 hover:bg-neutral-100'
                : 'text-neutral-500 hover:text-white hover:bg-neutral-800'
            )}
          >
            <X size={20} aria-hidden="true" />
          </button>
        </div>

        {/* Контент */}
        <div className="p-6 space-y-5">
          {reportSuccess ? (
            <div className="py-10 flex flex-col items-center text-center space-y-4 animate-in fade-in zoom-in duration-300">
              <div className="w-16 h-16 bg-green-500/10 border border-green-500/20 rounded-full flex items-center justify-center text-green-500">
                <CheckCircle2 size={32} aria-hidden="true" />
              </div>
              <div className="space-y-2">
                <h3
                  className={cn(
                    'text-xl font-bold',
                    isLight ? 'text-neutral-900' : 'text-white'
                  )}
                >
                  Спасибо за вклад!
                </h3>
                <p className="text-sm text-neutral-500 leading-relaxed">
                  Твой репорт уже летит к разработчику на крыльях цифрового дракона.
                  Вместе мы сделаем NeuroRPG легендарной.
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-5 animate-in fade-in duration-300">
              {/* Тип репорта */}
              <div
                className={cn(
                  'flex gap-2 p-1 rounded-2xl border',
                  isLight
                    ? 'bg-neutral-100 border-neutral-200'
                    : 'bg-neutral-900 border-neutral-800'
                )}
                role="group"
                aria-label="Тип обращения"
              >
                {(['bug', 'suggestion', 'typo'] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setReportType(t)}
                    aria-pressed={reportType === t}
                    className={cn(
                      'flex-1 py-2.5 text-xs font-bold uppercase tracking-wider rounded-xl transition-all',
                      reportType === t
                        ? 'bg-orange-600 text-white shadow-sm'
                        : isLight
                        ? 'text-neutral-500 hover:text-neutral-700'
                        : 'text-neutral-500 hover:text-neutral-300'
                    )}
                  >
                    {t === 'bug' ? 'Баг' : t === 'suggestion' ? 'Идея' : 'Опечатка'}
                  </button>
                ))}
              </div>

              {/* Текстовое поле */}
              <div className="space-y-2">
                <label
                  htmlFor="report-message"
                  className="text-xs font-bold text-neutral-500 uppercase tracking-widest"
                >
                  Описание
                </label>
                <textarea
                  id="report-message"
                  value={reportMessage}
                  onChange={(e) => setReportMessage(e.target.value)}
                  placeholder={
                    reportType === 'bug'
                      ? 'Что сломалось? Как это повторить?'
                      : reportType === 'suggestion'
                      ? 'Опиши свою гениальную идею...'
                      : 'Где мы ошиблись в тексте?'
                  }
                  rows={4}
                  maxLength={2000}
                  className={cn(
                    'w-full border rounded-2xl p-4 text-sm',
                    'focus:outline-none focus:border-orange-500 transition-colors resize-none',
                    isLight
                      ? 'bg-neutral-50 border-neutral-200 text-neutral-900 placeholder-neutral-400'
                      : 'bg-neutral-900 border-neutral-800 text-white placeholder-neutral-600'
                  )}
                />
              </div>

              {/* Кнопка отправки */}
              <button
                onClick={handleSendReport}
                disabled={isReporting || !reportMessage.trim()}
                className="w-full flex items-center justify-center gap-2 py-4 bg-orange-600 hover:bg-orange-500 disabled:bg-neutral-800 disabled:text-neutral-600 text-white rounded-2xl font-bold transition-all focus:outline-none focus:ring-2 focus:ring-orange-500"
              >
                {isReporting ? (
                  <Loader2 size={18} className="animate-spin" aria-hidden="true" />
                ) : (
                  <Send size={18} aria-hidden="true" />
                )}
                {isReporting ? 'Отправка...' : 'Отправить'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// Профиль пользователя
// ─────────────────────────────────────────────

interface UserProfileViewProps {
  user: User;
  onClose: () => void;
  onOpenSettings: () => void;
  onLogout: () => void;
  isLight: boolean;
}

function UserProfileView({
  user,
  onClose,
  onOpenSettings,
  onLogout,
  isLight,
}: UserProfileViewProps) {
  const displayName =
    user.user_metadata?.full_name || user.email?.split('@')[0] || 'Игрок';
  const avatarUrl = user.user_metadata?.avatar_url as string | undefined;
  const firstLetter = (user.email?.[0] ?? 'U').toUpperCase();
  const shortId = user.id.slice(0, 8);

  return (
    <div
      className={cn(
        'flex-1 flex flex-col p-6 space-y-8 overflow-y-auto',
        isLight ? 'bg-white' : 'bg-black'
      )}
    >
      <div className="flex justify-between items-center">
        <h2
          className={cn(
            'text-2xl font-bold font-display',
            isLight ? 'text-neutral-900' : 'text-white'
          )}
        >
          Профиль
        </h2>
        <button
          onClick={onClose}
          aria-label="Закрыть профиль"
          className={cn(
            'p-2 rounded-xl transition-colors',
            isLight
              ? 'text-neutral-400 hover:text-neutral-900 hover:bg-neutral-100'
              : 'text-neutral-500 hover:text-white hover:bg-neutral-900'
          )}
        >
          <X size={24} aria-hidden="true" />
        </button>
      </div>

      {/* Аватар и имя */}
      <div className="flex flex-col items-center text-center space-y-4 py-4">
        <div className="w-32 h-32 rounded-[2.5rem] bg-neutral-800 border-2 border-orange-500/30 flex items-center justify-center overflow-hidden shadow-2xl shadow-orange-500/10">
          {avatarUrl ? (
            <img src={avatarUrl} alt={displayName} className="w-full h-full object-cover" />
          ) : (
            <span className="text-5xl font-bold text-white">{firstLetter}</span>
          )}
        </div>
        <div>
          <h3
            className={cn(
              'text-2xl font-bold',
              isLight ? 'text-neutral-900' : 'text-white'
            )}
          >
            {displayName}
          </h3>
          <p className="text-neutral-500 text-sm mt-1">{user.email}</p>
        </div>
      </div>

      {/* Статистика */}
      <div className="grid grid-cols-2 gap-4">
        <div
          className={cn(
            'border p-4 rounded-3xl space-y-1',
            isLight
              ? 'bg-neutral-50 border-neutral-200'
              : 'bg-neutral-900/50 border-neutral-800'
          )}
        >
          <p className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest">
            Статус
          </p>
          <p
            className={cn(
              'font-bold flex items-center gap-2',
              isLight ? 'text-neutral-900' : 'text-white'
            )}
          >
            <span
              className="w-2 h-2 rounded-full bg-green-500 animate-pulse"
              aria-hidden="true"
            />
            В сети
          </p>
        </div>
        <div
          className={cn(
            'border p-4 rounded-3xl space-y-1',
            isLight
              ? 'bg-neutral-50 border-neutral-200'
              : 'bg-neutral-900/50 border-neutral-800'
          )}
        >
          <p className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest">
            ID
          </p>
          <p
            className={cn(
              'font-mono text-xs truncate',
              isLight ? 'text-neutral-900' : 'text-white'
            )}
          >
            {shortId}...
          </p>
        </div>
      </div>

      {/* Управление */}
      <div className="space-y-3">
        <h4 className="text-xs font-bold text-neutral-500 uppercase tracking-widest px-2">
          Управление
        </h4>
        <button
          onClick={onOpenSettings}
          className={cn(
            'w-full flex items-center gap-4 p-4 border rounded-2xl transition-all',
            isLight
              ? 'bg-white border-neutral-200 hover:bg-neutral-50'
              : 'bg-neutral-900 border-neutral-800 hover:bg-neutral-800'
          )}
        >
          <Settings
            size={20}
            className="text-neutral-400"
            aria-hidden="true"
          />
          <span
            className={cn(
              'font-bold',
              isLight ? 'text-neutral-900' : 'text-white'
            )}
          >
            Настройки
          </span>
        </button>
        <button
          onClick={onLogout}
          className="w-full flex items-center gap-4 p-4 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 rounded-2xl transition-all text-red-500"
        >
          <LogOut size={20} aria-hidden="true" />
          <span className="font-bold">Выйти из аккаунта</span>
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// Главный компонент App
// ─────────────────────────────────────────────

export default function App() {
  // ─── Auth состояние ──────────────────────────────────────────────────
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [isSigningIn, setIsSigningIn] = useState(false);

  // ─── Navigation состояние ────────────────────────────────────────────
  const [currentRoomId, setCurrentRoomId] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<ViewState>('main');
  const [showProfile, setShowProfile] = useState(false);

  // ─── UI состояние ────────────────────────────────────────────────────
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  // Ref для кнопки меню — закрываем меню только при клике ВНЕ кнопки
  const moreMenuButtonRef = useRef<HTMLButtonElement>(null);

  /**
   * Храним функцию в ref — не в state — чтобы избежать двойной стрелки.
   * setConfirmAction(() => () => {}) — это антипаттерн (React вызывает updater).
   */
  const confirmActionRef = useRef<() => void>(() => {});

  // ─── Настройки ───────────────────────────────────────────────────────
  const [appSettings, setAppSettings] = useState<AppSettings>(() =>
    safeLoadFromStorage('appSettings', DEFAULT_APP_SETTINGS)
  );

  const [chatSettings, setChatSettings] = useState<ChatSettings>(() =>
    safeLoadFromStorage('chatSettings', DEFAULT_CHAT_SETTINGS)
  );

  const isLight = appSettings.theme === 'light';

  // ─────────────────────────────────────────────
  // Effects
  // ─────────────────────────────────────────────

  // Сохраняем appSettings + применяем тему к document.body
  useEffect(() => {
    localStorage.setItem('appSettings', JSON.stringify(appSettings));

    // Убираем все старые классы тем
    document.body.classList.remove('light-theme', 'black-theme');

    const themeClass = getThemeBodyClass(appSettings.theme);
    if (themeClass) {
      document.body.classList.add(themeClass);
    }
  }, [appSettings]);

  // Сохраняем chatSettings
  useEffect(() => {
    localStorage.setItem('chatSettings', JSON.stringify(chatSettings));
  }, [chatSettings]);

  // Online/Offline события
  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Глобальный обработчик 401 от api.ts
  useEffect(() => {
    const handleUnauthorized = () => {
      console.warn('[App] Получен api:unauthorized — выполняем logout');
      logout();
    };

    window.addEventListener('api:unauthorized', handleUnauthorized);
    return () => window.removeEventListener('api:unauthorized', handleUnauthorized);
  }, []);

  // Закрываем меню при клике вне кнопки
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        moreMenuButtonRef.current &&
        !moreMenuButtonRef.current.contains(e.target as Node)
      ) {
        setShowMoreMenu(false);
      }
    };

    if (showMoreMenu) {
      // Добавляем listener только когда меню открыто
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showMoreMenu]);

  // Подавляем Vite WebSocket ошибки в dev режиме
  useEffect(() => {
    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      const message = event.reason?.message ?? '';
      if (message.includes('WebSocket') || message.includes('vite')) {
        event.preventDefault();
      }
    };

    window.addEventListener('unhandledrejection', handleUnhandledRejection);
    return () => window.removeEventListener('unhandledrejection', handleUnhandledRejection);
  }, []);

  // Auth инициализация и подписка на изменения
  useEffect(() => {
    // Читаем начальную сессию
    supabase.auth.getSession().then(({ data: { session } }) => {
      const currentUser = session?.user ?? null;
      setUser(currentUser);

      if (currentUser) {
        const savedRoomId = localStorage.getItem(`currentRoomId_${currentUser.id}`);
        if (savedRoomId) setCurrentRoomId(savedRoomId);
      }

      setLoading(false);
    });

    // Слушаем изменения auth состояния
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      const currentUser = session?.user ?? null;
      setUser(currentUser);

      if (currentUser) {
        const savedRoomId = localStorage.getItem(`currentRoomId_${currentUser.id}`);
        if (savedRoomId) setCurrentRoomId(savedRoomId);
      } else {
        // Пользователь вышел — сбрасываем комнату
        setCurrentRoomId(null);
        setActiveView('main');
      }

      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  // ─────────────────────────────────────────────
  // Handlers
  // ─────────────────────────────────────────────

  const handleSignIn = useCallback(async () => {
    setAuthError(null);
    setIsSigningIn(true);

    const result = await signInWithGoogle();

    if (result && !result.success) {
      setAuthError(result.error ?? 'Произошла неизвестная ошибка');
      setIsSigningIn(false);
    }
    // Если успех — onAuthStateChange сам обновит user
  }, []);

  const handleRoomSelected = useCallback(
    (roomId: string) => {
      if (!user) return;
      localStorage.setItem(`currentRoomId_${user.id}`, roomId);
      setCurrentRoomId(roomId);
      setActiveView('main');
      setShowProfile(false);
    },
    [user]
  );

  const handleMinimizeRoom = useCallback(() => {
    if (!user) return;
    localStorage.removeItem(`currentRoomId_${user.id}`);
    setCurrentRoomId(null);
    setActiveView('main');
  }, [user]);

  const handleLeaveRoom = useCallback(() => {
    if (!user) return;

    if (!currentRoomId) {
      // Нечего покидать — просто сбрасываем
      localStorage.removeItem(`currentRoomId_${user.id}`);
      setCurrentRoomId(null);
      setActiveView('main');
      return;
    }

    // Показываем confirm модал
    confirmActionRef.current = () => {
      localStorage.removeItem(`currentRoomId_${user.id}`);
      setCurrentRoomId(null);
      setActiveView('main');
      setShowConfirmModal(false);
    };
    setShowConfirmModal(true);
  }, [user, currentRoomId]);

  const handleLogout = useCallback(() => {
    logout();
    setShowProfile(false);
  }, []);

  const handleOpenSettings = useCallback(() => {
    setActiveView('settings');
    setShowProfile(false);
    setShowMoreMenu(false);
  }, []);

  // ─────────────────────────────────────────────
  // Render: Loading
  // ─────────────────────────────────────────────

  if (loading) {
    return (
      <div
        className="min-h-[100dvh] bg-black flex items-center justify-center text-neutral-400"
        aria-live="polite"
        aria-busy="true"
      >
        <Loader2 className="w-8 h-8 animate-spin" aria-hidden="true" />
      </div>
    );
  }

  // ─────────────────────────────────────────────
  // Render: Login
  // ─────────────────────────────────────────────

  if (!user) {
    return (
      <>
        <LoginScreen
          onSignIn={handleSignIn}
          isSigningIn={isSigningIn}
          authError={authError}
          onOpenReport={() => setShowReportModal(true)}
        />
        <ReportModal
          isOpen={showReportModal}
          onClose={() => setShowReportModal(false)}
          user={null}
          currentRoomId={null}
          isLight={false}
        />
      </>
    );
  }

  // ─────────────────────────────────────────────
  // Render: Main App
  // ─────────────────────────────────────────────

  const displayName =
    (user.user_metadata?.full_name as string | undefined)?.split(' ')[0] ||
    user.email?.split('@')[0] ||
    'Игрок';

  const avatarUrl = user.user_metadata?.avatar_url as string | undefined;

  return (
    <ErrorBoundary>
      <div
        className={cn(
          'h-[100dvh] text-neutral-100 font-sans flex flex-col max-w-md mx-auto',
          'relative shadow-2xl overflow-hidden border-x',
          appSettings.theme === 'black'
            ? 'bg-black border-neutral-900'
            : isLight
            ? 'bg-white text-black border-neutral-200'
            : 'bg-neutral-950 border-neutral-900',
          !appSettings.animations && 'no-animations',
          appSettings.performanceMode && 'performance-mode'
        )}
      >
        {/* Offline banner */}
        {isOffline && (
          <div
            className="bg-red-500 text-white text-[10px] font-bold text-center py-1 z-50 shrink-0 uppercase tracking-widest"
            role="status"
            aria-live="polite"
          >
            Автономный режим
          </div>
        )}

        {/* Header — только для main view */}
        {activeView === 'main' && (
          <header
            className={cn(
              'shrink-0 border-b backdrop-blur-md p-5 flex justify-between items-center z-30',
              isLight ? 'bg-white/80 border-neutral-200' : 'bg-black/80 border-neutral-900'
            )}
          >
            {/* Левая часть — лого + бестиарий */}
            <div className="flex items-center gap-3">
              <h1
                className={cn(
                  'text-2xl font-bold tracking-tight cursor-pointer font-display',
                  isLight ? 'text-black' : 'text-white'
                )}
                onClick={() => setActiveView('main')}
              >
                NeuroRPG
              </h1>

              {currentRoomId && (
                <button
                  onClick={() => setActiveView('bestiary')}
                  className="text-orange-500 hover:text-orange-400 flex items-center gap-1 text-sm font-bold uppercase tracking-wider bg-orange-500/10 px-3 py-1.5 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-orange-500"
                >
                  <BookOpen size={16} aria-hidden="true" />
                  Бестиарий
                </button>
              )}
            </div>

            {/* Правая часть — меню комнаты или профиль */}
            <div className="flex items-center gap-2">
              {currentRoomId ? (
                <>
                  {/* Свернуть игру */}
                  <button
                    onClick={handleMinimizeRoom}
                    aria-label="Свернуть игру — вернуться в лобби"
                    className={cn(
                      'p-2 transition-colors rounded-xl',
                      isLight
                        ? 'text-neutral-400 hover:text-neutral-900 hover:bg-neutral-100'
                        : 'text-neutral-400 hover:text-white hover:bg-neutral-900'
                    )}
                  >
                    <Home size={24} aria-hidden="true" />
                  </button>

                  {/* Дополнительное меню */}
                  <div className="relative">
                    <button
                      ref={moreMenuButtonRef}
                      onClick={() => setShowMoreMenu((prev) => !prev)}
                      aria-label="Дополнительные действия"
                      aria-expanded={showMoreMenu}
                      aria-haspopup="menu"
                      className={cn(
                        'p-2 transition-colors rounded-xl',
                        isLight
                          ? 'text-neutral-400 hover:text-neutral-900 hover:bg-neutral-100'
                          : 'text-neutral-400 hover:text-white hover:bg-neutral-900'
                      )}
                    >
                      <MoreVertical size={24} aria-hidden="true" />
                    </button>

                    {showMoreMenu && (
                      <div
                        role="menu"
                        className={cn(
                          'absolute right-0 mt-2 w-56 rounded-2xl shadow-2xl overflow-hidden z-50 border',
                          isLight
                            ? 'bg-white border-neutral-200'
                            : 'bg-neutral-900 border-neutral-800'
                        )}
                      >
                        <button
                          role="menuitem"
                          onClick={handleOpenSettings}
                          className={cn(
                            'w-full flex items-center gap-3 px-5 py-4 text-base transition-colors',
                            isLight
                              ? 'text-neutral-700 hover:bg-neutral-50'
                              : 'text-neutral-300 hover:bg-neutral-800'
                          )}
                        >
                          <Settings size={20} aria-hidden="true" />
                          Настройки
                        </button>
                        <button
                          role="menuitem"
                          onClick={() => {
                            handleLeaveRoom();
                            setShowMoreMenu(false);
                          }}
                          className="w-full flex items-center gap-3 px-5 py-4 text-base text-red-400 hover:bg-red-500/10 transition-colors"
                        >
                          <DoorOpen size={20} aria-hidden="true" />
                          Покинуть сессию
                        </button>
                      </div>
                    )}
                  </div>
                </>
              ) : (
                /* Кнопка профиля */
                <button
                  onClick={() => setShowProfile(true)}
                  aria-label={`Профиль пользователя ${displayName}`}
                  className={cn(
                    'flex items-center gap-3 p-1.5 rounded-2xl transition-all active:scale-95',
                    isLight ? 'hover:bg-neutral-100' : 'hover:bg-neutral-900'
                  )}
                >
                  <span
                    className={cn(
                      'text-sm font-bold uppercase tracking-widest truncate max-w-[80px]',
                      isLight ? 'text-neutral-500' : 'text-neutral-500'
                    )}
                  >
                    {displayName}
                  </span>
                  <div className="w-10 h-10 rounded-full bg-neutral-800 border border-neutral-700 flex items-center justify-center overflow-hidden shrink-0">
                    {avatarUrl ? (
                      <img
                        src={avatarUrl}
                        alt={displayName}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <span className="text-base text-white font-bold">
                        {(user.email?.[0] ?? 'U').toUpperCase()}
                      </span>
                    )}
                  </div>
                </button>
              )}
            </div>
          </header>
        )}

        {/* Main content */}
        <main className="flex-1 flex flex-col relative overflow-hidden">
          {showProfile ? (
            <UserProfileView
              user={user}
              onClose={() => setShowProfile(false)}
              onOpenSettings={handleOpenSettings}
              onLogout={handleLogout}
              isLight={isLight}
            />
          ) : activeView === 'bestiary' ? (
            <BestiaryView
              onBack={() => setActiveView('main')}
              appSettings={appSettings}
            />
          ) : activeView === 'settings' ? (
            <SettingsView
              appSettings={appSettings}
              setAppSettings={setAppSettings}
              chatSettings={chatSettings}
              setChatSettings={setChatSettings}
              onClose={() => setActiveView('main')}
            />
          ) : currentRoomId ? (
            <RoomView
              roomId={currentRoomId}
              user={user}
              onLeave={handleLeaveRoom}
              onMinimize={handleMinimizeRoom}
              onOpenBestiary={() => setActiveView('bestiary')}
              appSettings={appSettings}
              chatSettings={chatSettings}
            />
          ) : (
            <Lobby
              onOpenBestiary={() => setActiveView('bestiary')}
              onOpenSettings={() => setActiveView('settings')}
              onOpenReport={() => setShowReportModal(true)}
              appSettings={appSettings}
              onRoomSelected={handleRoomSelected}
            />
          )}
        </main>

        {/* Confirm Modal */}
        <ConfirmModal
          isOpen={showConfirmModal}
          title="Покинуть игру"
          message="Вы уверены, что хотите полностью покинуть эту игру? Ваш персонаж останется в истории, но вы больше не будете активным участником."
          onConfirm={confirmActionRef.current}
          onCancel={() => setShowConfirmModal(false)}
          appSettings={appSettings}
        />

        {/* Report Modal */}
        <ReportModal
          isOpen={showReportModal}
          onClose={() => setShowReportModal(false)}
          user={user}
          currentRoomId={currentRoomId}
          isLight={isLight}
        />
      </div>
    </ErrorBoundary>
  );
}