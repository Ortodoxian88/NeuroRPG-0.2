import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';
import 'dotenv/config';

const isProduction = process.env.NODE_ENV === 'production';

// Инициализация пула соединений
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10, // Ограничение Supabase Free Tier
  ssl: isProduction ? { rejectUnauthorized: false } : false,
});

// Обработка ошибок простаивающих клиентов пула
pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
  process.exit(-1);
});

/**
 * Проверка подключения к БД при старте сервера
 */
export async function checkDatabaseConnection(): Promise<boolean> {
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
