import express from 'express';
import cors from 'cors';
import path from 'path';
import { apiRouter } from './server/routes/api.routes';
import { checkDatabaseConnection } from './server/database/client';
import 'dotenv/config';

// Global error handlers for better debugging on Render
process.on('uncaughtException', (err) => {
  console.error('[Server] CRITICAL: Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[Server] CRITICAL: Unhandled Rejection at:', promise, 'reason:', reason);
});

console.log('[Server] >>> NEURORPG SERVER STARTING <<<');

const app = express();

// 1. Middlewares
app.use(cors());
app.use(express.json({ limit: '1mb' }));

// Добавляем заголовок версии для отладки
app.use((req, res, next) => {
  res.setHeader("X-Server-Version", "1.0.2");
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin-allow-popups");
  res.setHeader("Cross-Origin-Embedder-Policy", "unsafe-none");
  next();
});

// 2. API Роуты
// Регистрируем ПРЯМО ЗДЕСЬ для максимальной надежности
app.use('/api', apiRouter);

// Дополнительный проверочный роут прямо в корне app
app.get('/api/ping', (req, res) => {
  res.json({ 
    status: 'ok', 
    version: '1.0.2',
    timestamp: new Date().toISOString(),
    env: process.env.NODE_ENV
  });
});

// 3. Статика и Vite (Development vs Production)
async function setupStatic() {
  const __dirname = path.resolve();
  const distPath = path.join(__dirname, 'dist');

  if (process.env.NODE_ENV !== 'production') {
    console.log('[Server] Running in DEVELOPMENT mode (Vite)');
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    console.log('[Server] Running in PRODUCTION mode (Static)');
    console.log(`[Server] Serving static files from: ${distPath}`);
    
    // Проверяем наличие папки dist
    app.use(express.static(distPath));
    
    // 4. Catch-all (Для SPA навигации) - ВСЕГДА последний
    app.get('*', (req, res) => {
      // Если это запрос к /api, который не сработал выше - возвращаем 404 JSON, а не HTML
      if (req.path.startsWith('/api')) {
        return res.status(404).json({ error: `API route not found: ${req.path}` });
      }
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }
}

// 5. Функция запуска
async function startServer() {
  try {
    console.log('[Server] Checking database connection...');
    let isDbConnected = false;
    try {
      isDbConnected = await checkDatabaseConnection();
    } catch (dbErr) {
      console.error('[Server] Unexpected error during DB connection check:', dbErr);
    }
    
    if (!isDbConnected) {
      console.error('[Server] ❌ CRITICAL: Database not available. API endpoints will fail.');
      console.error('[Server] Ensure DATABASE_URL is set correctly in Render dashboard.');
    }

    await setupStatic();

    const PORT = Number(process.env.PORT) || 3000;
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`[Server] ✅ Started on port ${PORT}`);
      console.log(`[Server] Health check: http://localhost:${PORT}/api/health/db`);
    });
  } catch (error) {
    console.error('[Server] Failed to start server:', error);
    process.exit(1);
  }
}

startServer();
