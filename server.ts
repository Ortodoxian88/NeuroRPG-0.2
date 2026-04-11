// server.ts

import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { readFileSync } from 'fs';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet'; // npm install helmet
import { apiRouter } from './server/routes/api.routes';
import { checkDatabaseConnection, pool } from './server/database/client';
import 'dotenv/config';

// ─────────────────────────────────────────────
// Типы
// ─────────────────────────────────────────────

declare global {
  namespace NodeJS {
    interface ProcessEnv {
      NODE_ENV: 'development' | 'production' | 'test';
      PORT?: string;
      DATABASE_URL: string;
      FRONTEND_URL?: string;
      SUPABASE_JWT_SECRET: string;
      GEMINI_API_KEY?: string; // Для проверки наличия
    }
  }
}

// ─────────────────────────────────────────────
// Константы
// ─────────────────────────────────────────────

// Читаем версию из package.json — единственный источник правды
const pkg = JSON.parse(readFileSync('./package.json', 'utf-8')) as { version: string };
const VERSION = pkg.version;

const PORT_ENV = process.env.PORT ?? '3000';
const PORT = parseInt(PORT_ENV, 10);

// Валидация PORT
if (isNaN(PORT) || PORT < 1 || PORT > 65535) {
  console.error(`[Server] ❌ Некорректный PORT: "${PORT_ENV}". Должно быть число 1-65535.`);
  process.exit(1);
}

// __dirname не существует в ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Время старта — для метрик
const SERVER_START_TIME = Date.now();

// ─────────────────────────────────────────────
// Глобальные обработчики ошибок
// ─────────────────────────────────────────────

/**
 * uncaughtException — критическая ошибка вне try/catch.
 * Состояние процесса непредсказуемо → единственное решение — перезапуск.
 */
process.on('uncaughtException', (err) => {
  console.error('[Server] CRITICAL: Uncaught Exception:', err);
  console.error('[Server] Процесс будет завершён для перезапуска');
  process.exit(1);
});

/**
 * unhandledRejection — Promise отклонён без .catch().
 * В продакшене это тоже критическая ошибка.
 */
process.on('unhandledRejection', (reason, promise) => {
  console.error('[Server] CRITICAL: Unhandled Rejection at:', promise);
  console.error('[Server] Причина:', reason);
  process.exit(1);
});

// ─────────────────────────────────────────────
// Приложение
// ─────────────────────────────────────────────

console.log(`[Server] ╔═══════════════════════════════════════════╗`);
console.log(`[Server] ║   NEURORPG SERVER v${VERSION.padEnd(21)} ║`);
console.log(`[Server] ╚═══════════════════════════════════════════╝`);
console.log(`[Server] Режим: ${process.env.NODE_ENV}`);
console.log(`[Server] Node.js: ${process.version}`);

const app = express();

// ─────────────────────────────────────────────
// Базовые security заголовки (helmet)
// ─────────────────────────────────────────────

app.use(
  helmet({
    // Отключаем contentSecurityPolicy — конфликтует с Vite в dev режиме
    // В prod настроим отдельно через nginx/Cloudflare
    contentSecurityPolicy: false,

    // Оставляем твои кастомные заголовки для Supabase OAuth
    crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' },
    crossOriginEmbedderPolicy: false, // unsafe-none через helmet не поддерживается
  })
);

// Добавляем кастомный заголовок версии
app.use((_req, res, next) => {
  res.setHeader('X-Server-Version', VERSION);
  // COEP заголовок вручную (helmet не поддерживает unsafe-none)
  res.setHeader('Cross-Origin-Embedder-Policy', 'unsafe-none');
  next();
});

// ─────────────────────────────────────────────
// CORS
// ─────────────────────────────────────────────

const ALLOWED_ORIGINS = [
  'http://localhost:5173', // Vite dev server
  'http://localhost:3000', // Express dev server
  process.env.FRONTEND_URL, // Production frontend
].filter((origin): origin is string => Boolean(origin));

app.use(
  cors({
    origin: (origin, callback) => {
      // Запросы без origin (Postman, curl, мобильные приложения) — разрешаем
      if (!origin) return callback(null, true);

      // Проверяем whitelist
      if (ALLOWED_ORIGINS.includes(origin)) {
        return callback(null, true);
      }

      // Dev режим: разрешаем любой localhost
      if (
        process.env.NODE_ENV !== 'production' &&
        origin.startsWith('http://localhost:')
      ) {
        return callback(null, true);
      }

      // Блокируем и логируем
      console.warn(`[CORS] ❌ Заблокирован origin: ${origin}`);
      callback(new Error(`CORS: origin "${origin}" не разрешён`));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Last-Event-ID'],
  })
);

// ─────────────────────────────────────────────
// Body парсинг
// ─────────────────────────────────────────────

/**
 * Лимит 100KB — защита от DoS и случайных больших запросов.
 * 
 * Почему не 1MB:
 * - Gemini API платный (~$0.002 за 1000 токенов)
 * - 1MB текста = ~250K токенов = $0.50 за запрос
 * - Атака: 100 запросов/мин * $0.50 = $50/мин = $72K/день
 * 
 * 100KB достаточно для любого игрового действия (даже развёрнутого).
 */
app.use(express.json({ limit: '100kb' }));

// ─────────────────────────────────────────────
// Health checks — БЕЗ rate limiting
// ─────────────────────────────────────────────

/**
 * Health check для мониторинга (Render, UptimeRobot, и т.д.).
 * НЕ должен иметь rate limit — иначе ложные срабатывания.
 */
app.get('/api/health', async (_req, res) => {
  try {
    // Проверяем БД быстрым запросом
    const dbOk = await checkDatabaseConnection();

    const uptime = Math.floor((Date.now() - SERVER_START_TIME) / 1000);

    res.json({
      status: dbOk ? 'healthy' : 'degraded',
      version: VERSION,
      uptime,
      timestamp: new Date().toISOString(),
      database: dbOk ? 'connected' : 'disconnected',
    });
  } catch (err) {
    res.status(503).json({
      status: 'unhealthy',
      error: 'Database check failed',
    });
  }
});

/**
 * Простой ping — для быстрой проверки что сервер жив.
 */
app.get('/api/ping', (_req, res) => {
  res.json({
    pong: true,
    version: VERSION,
    timestamp: Date.now(),
  });
});

// ─────────────────────────────────────────────
// Rate Limiting
// ─────────────────────────────────────────────

/**
 * Общий лимит для всего API.
 * 100 запросов/мин с одного IP — достаточно для нормального использования.
 */
const generalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  standardHeaders: true, // Добавляет RateLimit-* заголовки
  legacyHeaders: false,  // Отключаем X-RateLimit-* (deprecated)
  // Не лимитируем SSE — это long-lived соединения
  skip: (req) => req.path.includes('/events'),
  message: { error: 'Слишком много запросов. Подождите минуту.' },
});

/**
 * Жёсткий лимит для AI запросов.
 * 15 запросов/мин — защита от abuse и лимитов Gemini API.
 * 
 * ВАЖНО: Применяется в routes/rooms.ts, НЕ через app.use()
 * (Express не поддерживает :param в app.use() пути)
 */
export const aiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Слишком много запросов к ИИ. Подождите минуту.',
    retryAfter: 60,
  },
});

// Применяем general limiter ко всему /api (кроме health/ping которые выше)
app.use('/api', generalLimiter);

// ─────────────────────────────────────────────
// API роуты
// ─────────────────────────────────────────────

app.use('/api', apiRouter);

/**
 * Catch-all для несуществующих /api/* роутов.
 * Возвращаем JSON 404 вместо HTML (важно для SPA).
 */
app.use('/api/*', (req, res) => {
  res.status(404).json({
    error: 'API endpoint not found',
    path: req.path,
    method: req.method,
  });
});

// ─────────────────────────────────────────────
// Статика и SPA
// ─────────────────────────────────────────────

async function setupStatic(): Promise<void> {
  try {
    if (process.env.NODE_ENV !== 'production') {
      console.log('[Server] 🔧 Dev режим — подключаем Vite middleware');

      const { createServer: createViteServer } = await import('vite');
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: 'spa',
      });

      app.use(vite.middlewares);
      console.log('[Server] ✅ Vite middleware активен');
    } else {
      const distPath = path.join(__dirname, 'dist');

      console.log('[Server] 📦 Prod режим — раздаём статику');
      console.log(`[Server] Путь к dist: ${distPath}`);

      // Статические файлы с агрессивным кэшированием
      app.use(
        express.static(distPath, {
          maxAge: '1y', // Файлы с хешами в именах — кэшируем навсегда
          etag: true,
          immutable: true, // Подсказка браузеру что файл никогда не изменится
          setHeaders: (res, filePath) => {
            // HTML НЕ кэшируем — должен быть всегда свежим
            if (filePath.endsWith('.html')) {
              res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
            }
          },
        })
      );

      /**
       * SPA catch-all — ВСЕГДА последний роут.
       * Отдаёт index.html для всех не-API путей (client-side routing).
       */
      app.get('*', (_req, res) => {
        res.sendFile(path.join(distPath, 'index.html'));
      });

      console.log('[Server] ✅ Статика настроена');
    }
  } catch (err) {
    console.error('[Server] ❌ Ошибка настройки статики:', err);
    throw err; // Пробрасываем дальше в startServer()
  }
}

// ─────────────────────────────────────────────
// Запуск
// ─────────────────────────────────────────────

async function startServer(): Promise<void> {
  try {
    // ─── 1. Проверяем обязательные ENV переменные ─────────────────────

    const requiredEnvVars = ['DATABASE_URL', 'SUPABASE_JWT_SECRET'];
    const missingVars = requiredEnvVars.filter((v) => !process.env[v]);

    if (missingVars.length > 0) {
      console.error(`[Server] ❌ Отсутствуют ENV переменные: ${missingVars.join(', ')}`);
      console.error(`[Server] Создайте .env файл или настройте переменные в Render/Vercel`);
      process.exit(1); // Падаем в любом режиме — без них работать нельзя
    }

    // ─── 2. Проверяем БД ───────────────────────────────────────────────

    console.log('[Server] 🔌 Проверяем подключение к БД...');

    let isDbConnected = false;
    try {
      isDbConnected = await checkDatabaseConnection();
    } catch (dbErr) {
      console.error('[Server] ❌ Ошибка при проверке БД:', dbErr);
    }

    if (!isDbConnected) {
      console.error('[Server] ❌ БД недоступна');
      console.error('[Server] Проверь DATABASE_URL и firewall правила Render');
      // Падаем — невозможно работать без БД
      process.exit(1);
    }

    console.log('[Server] ✅ БД подключена');

    // ─── 3. Настраиваем статику/Vite ──────────────────────────────────

    await setupStatic();

    // ─── 4. Запускаем HTTP сервер ─────────────────────────────────────

    const server = app.listen(PORT, '0.0.0.0', () => {
      const startupTime = Date.now() - SERVER_START_TIME;
      console.log(`[Server] ✅ Запущен на порту ${PORT} за ${startupTime}ms`);
      console.log(`[Server] Health: http://localhost:${PORT}/api/health`);
      console.log(`[Server] Ping: http://localhost:${PORT}/api/ping`);
    });

    /**
     * Увеличиваем таймауты для SSE соединений.
     * По умолчанию Node.js закрывает idle соединения через 5 секунд.
     * 
     * keepAliveTimeout должен быть БОЛЬШЕ чем у nginx/CloudFlare (обычно 60s).
     * headersTimeout должен быть БОЛЬШЕ чем keepAliveTimeout.
     */
    server.keepAliveTimeout = 65000;
    server.headersTimeout = 66000;

    // ─── 5. Graceful Shutdown ──────────────────────────────────────────

    const shutdown = async (signal: string) => {
      console.log(`[Server] ${signal} получен — начинаем graceful shutdown...`);

      server.close(async () => {
        console.log('[Server] HTTP сервер остановлен');

        // Даём 5 секунд на завершение активных SSE соединений
        console.log('[Server] Ожидаем завершения SSE соединений...');
        await new Promise((resolve) => setTimeout(resolve, 5000));

        // Закрываем пул БД
        try {
          await pool.end();
          console.log('[Server] Пул БД закрыт');
        } catch (err) {
          console.error('[Server] Ошибка закрытия пула БД:', err);
        }

        console.log('[Server] ✅ Shutdown завершён');
        process.exit(0);
      });

      // Принудительное завершение если graceful не успел за 15 сек
      setTimeout(() => {
        console.error('[Server] ❌ Graceful shutdown не завершился — принудительный exit');
        process.exit(1);
      }, 15000).unref();
    };

    process.on('SIGTERM', () => shutdown('SIGTERM')); // Render/Docker при деплое
    process.on('SIGINT', () => shutdown('SIGINT')); // Ctrl+C локально
  } catch (error) {
    console.error('[Server] ❌ Не удалось запустить сервер:', error);
    process.exit(1);
  }
}

// Поехали
startServer();