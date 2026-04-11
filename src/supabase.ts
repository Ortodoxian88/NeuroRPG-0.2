// src/supabase.ts

import { createClient, type SupabaseClient, type AuthError } from '@supabase/supabase-js';

// ─────────────────────────────────────────────
// Типы
// ─────────────────────────────────────────────

/**
 * Результат операции авторизации.
 * Унифицированный формат для всех auth методов.
 */
export interface AuthResult {
  success: boolean;
  error?: string;
}

// ─────────────────────────────────────────────
// Конфигурация
// ─────────────────────────────────────────────

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

/**
 * URL для редиректа после OAuth.
 * В production должен быть захардкожен для безопасности.
 * В dev — используем текущий origin.
 */
const REDIRECT_URL = import.meta.env.VITE_APP_URL || window.location.origin;

// ─────────────────────────────────────────────
// Валидация credentials
// ─────────────────────────────────────────────

if (!supabaseUrl || !supabaseAnonKey) {
  const missingVars = [];
  if (!supabaseUrl) missingVars.push('VITE_SUPABASE_URL');
  if (!supabaseAnonKey) missingVars.push('VITE_SUPABASE_ANON_KEY');

  throw new Error(
    `[Supabase] Missing environment variables: ${missingVars.join(', ')}.\n` +
    `Create a .env file in the project root with:\n` +
    `VITE_SUPABASE_URL=https://your-project.supabase.co\n` +
    `VITE_SUPABASE_ANON_KEY=your-anon-key`
  );
}

// ─────────────────────────────────────────────
// Supabase Client
// ─────────────────────────────────────────────

/**
 * Глобальный Supabase клиент.
 * Экспортируется для использования в api.ts и компонентах.
 *
 * **Не создавайте новые экземпляры клиента** — используйте этот.
 * createClient() внутри кэширует соединения и токены.
 */
export const supabase: SupabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    /**
     * autoRefreshToken — автоматически обновляет токен за 60 секунд до истечения.
     * persistSession — сохраняет сессию в localStorage.
     * detectSessionInUrl — парсит токены из URL после OAuth редиректа.
     */
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,

    /**
     * storage — можно заменить на кастомный (например, IndexedDB для больших данных).
     * По умолчанию — localStorage.
     */
    // storage: customStorage,
  },
});

// ─────────────────────────────────────────────
// Auth методы
// ─────────────────────────────────────────────

/**
 * Инициирует вход через Google OAuth.
 *
 * **Как это работает:**
 * 1. Вызов открывает popup/redirect на google.com
 * 2. Пользователь авторизуется в Google
 * 3. Google редиректит обратно на REDIRECT_URL с токеном в URL
 * 4. Supabase парсит токен и обновляет сессию (через onAuthStateChange)
 *
 * **Важно:**
 * Фактическая авторизация происходит асинхронно через onAuthStateChange.
 * Эта функция только **инициирует** процесс — не дожидается завершения.
 *
 * @returns Promise с результатом инициирования (не финальной авторизации)
 *
 * @example
 * const result = await signInWithGoogle();
 * if (!result.success) {
 *   alert(`Ошибка: ${result.error}`);
 * }
 * // Настоящий User придёт через onAuthStateChange в App.tsx
 */
export async function signInWithGoogle(): Promise<AuthResult> {
  try {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${REDIRECT_URL}/`,

        /**
         * queryParams — дополнительные параметры для Google OAuth.
         *
         * access_type: 'offline' — УДАЛЁН.
         * Причина: Даёт refresh token с бесконечным сроком действия.
         * Для игры это избыточно — Supabase сам управляет токенами.
         * Если нужен offline доступ к Google API — раскомментировать.
         *
         * prompt: 'consent' — УДАЛЁН.
         * Причина: Принудительно показывает consent screen каждый раз.
         * Раздражает пользователей. Оставить только если нужны расширенные scopes.
         */
        // queryParams: {
        //   access_type: 'offline',
        //   prompt: 'consent',
        // },

        /**
         * scopes — можно запросить дополнительные разрешения Google:
         * 'https://www.googleapis.com/auth/userinfo.profile'
         * 'https://www.googleapis.com/auth/drive.readonly'
         * По умолчанию — только email и базовый профиль.
         */
        // scopes: 'email profile',
      },
    });

    if (error) {
      return {
        success: false,
        error: formatAuthError(error),
      };
    }

    // Успешная инициация OAuth потока
    // Реальная авторизация произойдёт после редиректа
    return { success: true };
  } catch (err) {
    // Сетевые ошибки, проблемы с конфигурацией Supabase
    console.error('[Supabase] Unexpected error during sign in:', err);
    return {
      success: false,
      error: 'Произошла непредвиденная ошибка. Попробуйте снова.',
    };
  }
}

/**
 * Выходит из аккаунта и очищает сессию.
 *
 * **Что происходит:**
 * 1. Удаляет токены из localStorage
 * 2. Отправляет запрос в Supabase для инвалидации refresh token
 * 3. Вызывает onAuthStateChange с session = null
 *
 * @returns Promise с результатом выхода
 *
 * @example
 * const result = await logout();
 * if (!result.success) {
 *   console.error('Не удалось выйти:', result.error);
 * }
 */
export async function logout(): Promise<AuthResult> {
  try {
    const { error } = await supabase.auth.signOut();

    if (error) {
      return {
        success: false,
        error: formatAuthError(error),
      };
    }

    return { success: true };
  } catch (err) {
    console.error('[Supabase] Unexpected error during sign out:', err);
    return {
      success: false,
      error: 'Не удалось выйти из аккаунта',
    };
  }
}

/**
 * Получает текущую сессию синхронно из кэша.
 * Не делает запрос к серверу.
 *
 * **Использование:**
 * Для быстрой проверки авторизации без await.
 * Для получения токена в api.ts.
 *
 * @returns Объект сессии или null
 */
export function getCurrentSession() {
  return supabase.auth.getSession();
}

/**
 * Проверяет валидна ли текущая сессия.
 *
 * @returns true если пользователь авторизован
 */
export async function isAuthenticated(): Promise<boolean> {
  const { data: { session } } = await supabase.auth.getSession();
  return session !== null && session.expires_at ? session.expires_at * 1000 > Date.now() : false;
}

// ─────────────────────────────────────────────
// Утилиты
// ─────────────────────────────────────────────

/**
 * Форматирует AuthError в человекочитаемое сообщение.
 * Supabase возвращает технические ошибки — переводим их в понятный текст.
 *
 * @param error - Ошибка от Supabase
 * @returns Сообщение для пользователя
 */
function formatAuthError(error: AuthError): string {
  // Маппинг известных ошибок
  const errorMessages: Record<string, string> = {
    'Invalid login credentials': 'Неверный email или пароль',
    'Email not confirmed': 'Подтвердите email перед входом',
    'User not found': 'Пользователь не найден',
    'Invalid refresh token': 'Сессия истекла, войдите снова',
    'Email rate limit exceeded': 'Слишком много попыток, попробуйте позже',
  };

  const knownMessage = errorMessages[error.message];
  if (knownMessage) return knownMessage;

  // Для неизвестных ошибок — возвращаем оригинальное сообщение
  // В dev режиме логируем полную ошибку
  if (import.meta.env.DEV) {
    console.warn('[Supabase] Unmapped auth error:', error);
  }

  return error.message || 'Ошибка авторизации';
}