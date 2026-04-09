import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';
import 'dotenv/config';

const isProduction = process.env.NODE_ENV === 'production';

// Инициализация пула соединений
const dbUrl = process.env.DATABASE_URL;

if (!dbUrl) {
  console.error('[DB] ❌ DATABASE_URL is not defined in environment variables!');
}

// Создаем пул только если есть URL и он валидный
function createPool() {
  if (!dbUrl) return null;
  
  try {
    return new Pool({
      connectionString: dbUrl,
      max: 10, // Ограничение Supabase Free Tier
      ssl: isProduction ? { rejectUnauthorized: false } : false,
    });
  } catch (err) {
    console.error('[DB] ❌ Failed to initialize database pool (possibly invalid DATABASE_URL):', err);
    return null;
  }
}

export const pool = createPool();

// Обработка ошибок простаивающих клиентов пула
if (pool) {
  pool.on('error', (err) => {
    console.error('Unexpected error on idle client', err);
  });
}

/**
 * Проверка подключения к БД при старте сервера
 */
export async function checkDatabaseConnection(): Promise<boolean> {
  if (!pool) {
    console.error('[DB] ❌ Cannot check connection: pool not initialized (missing DATABASE_URL)');
    return false;
  }
  try {
    const client = await pool.connect();
    client.release();
    console.log('PostgreSQL database connection successful.');
    return true;
  } catch (err) {
    console.error('PostgreSQL database connection failed:', err);
    return false;
  }
}

/**
 * Обертка для обычных запросов с логированием медленных запросов
 */
export async function query<T extends QueryResultRow = any>(
  text: string,
  params?: any[]
): Promise<QueryResult<T>> {
  if (!pool) {
    throw new Error('Database pool not initialized. Check DATABASE_URL.');
  }
  const start = Date.now();
  const res = await pool.query<T>(text, params);
  const duration = Date.now() - start;
  
  if (duration > 1000) {
    console.warn(`[SLOW QUERY] Executed query in ${duration}ms: ${text}`);
  }
  
  return res;
}

/**
 * Обертка для выполнения транзакций (атомарных операций)
 */
export async function withTransaction<T>(
  callback: (client: PoolClient) => Promise<T>
): Promise<T> {
  if (!pool) {
    throw new Error('Database pool not initialized. Check DATABASE_URL.');
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}
