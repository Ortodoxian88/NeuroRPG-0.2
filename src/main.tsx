// src/main.tsx

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// ─────────────────────────────────────────────
// Root element проверка
// ─────────────────────────────────────────────

const rootElement = document.getElementById('root');

if (!rootElement) {
  // Критическая ошибка — невозможно смонтировать приложение
  throw new Error(
    '[NeuroRPG] Root element not found. ' +
    'Make sure index.html contains <div id="root"></div>'
  );
}

// ─────────────────────────────────────────────
// Монтирование приложения
// ─────────────────────────────────────────────

try {
  const root = createRoot(rootElement);

  root.render(
    <StrictMode>
      <App />
    </StrictMode>
  );
} catch (error) {
  // Отлавливаем ошибки монтирования — обычно это проблемы с DOM или React версией
  console.error('[NeuroRPG] Failed to mount application:', error);

  // Показываем понятную ошибку пользователю
  rootElement.innerHTML = `
    <div style="
      display: flex;
      align-items: center;
      justify-content: center;
      height: 100vh;
      background: #000;
      color: #ef4444;
      font-family: system-ui, sans-serif;
      text-align: center;
      padding: 2rem;
    ">
      <div>
        <h1 style="font-size: 1.5rem; margin-bottom: 1rem; font-weight: bold;">
          Не удалось запустить приложение
        </h1>
        <p style="color: #737373; margin-bottom: 2rem;">
          Попробуйте перезагрузить страницу или обновить браузер.
        </p>
        <button
          onclick="window.location.reload()"
          style="
            background: #f97316;
            color: white;
            padding: 0.75rem 1.5rem;
            border: none;
            border-radius: 0.5rem;
            font-weight: bold;
            cursor: pointer;
          "
        >
          Перезагрузить
        </button>
        <details style="margin-top: 2rem; text-align: left; color: #737373; font-size: 0.875rem;">
          <summary style="cursor: pointer;">Детали ошибки</summary>
          <pre style="
            margin-top: 1rem;
            padding: 1rem;
            background: #1a1a1a;
            border-radius: 0.5rem;
            overflow-x: auto;
            font-size: 0.75rem;
          ">${error instanceof Error ? error.stack : String(error)}</pre>
        </details>
      </div>
    </div>
  `;
}

// ─────────────────────────────────────────────
// Development режим — полезные подсказки
// ─────────────────────────────────────────────

if (import.meta.env.DEV) {
  console.log(
    '%c[NeuroRPG] Development Mode',
    'color: #f97316; font-weight: bold; font-size: 1.2rem;'
  );

  console.log('React version:', React.version);
  console.log('Environment:', {
    mode: import.meta.env.MODE,
    dev: import.meta.env.DEV,
    prod: import.meta.env.PROD,
  });

  // Включаем React DevTools подсказки (если StrictMode активен)
  console.log(
    '%cStrictMode is enabled — expect double renders in development',
    'color: #f59e0b; font-style: italic;'
  );
}

// ─────────────────────────────────────────────
// Service Worker регистрация (опционально)
// ─────────────────────────────────────────────

/**
 * Раскомментировать когда добавим Service Worker для offline режима.
 * 
 * if ('serviceWorker' in navigator && import.meta.env.PROD) {
 *   window.addEventListener('load', () => {
 *     navigator.serviceWorker
 *       .register('/service-worker.js')
 *       .then((registration) => {
 *         console.log('[SW] Registered:', registration.scope);
 *       })
 *       .catch((error) => {
 *         console.warn('[SW] Registration failed:', error);
 *       });
 *   });
 * }
 */