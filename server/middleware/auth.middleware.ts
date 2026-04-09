import { Request, Response, NextFunction } from 'express';
import * as admin from 'firebase-admin';
import { usersRepository } from '../database/repositories/users.repository';

// Инициализация один раз
if (!admin.apps.length) {
  try {
    // Поддерживаем обычный JSON и Base64 (для Render)
    const rawJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    const base64Json = process.env.FIREBASE_SERVICE_ACCOUNT_JSON_B64;
    
    let serviceAccount;
    if (base64Json) {
      serviceAccount = JSON.parse(Buffer.from(base64Json, 'base64').toString('utf-8'));
    } else if (rawJson) {
      serviceAccount = JSON.parse(rawJson);
    }

    if (serviceAccount) {
      // Исправляем переносы строк в ключе
      if (serviceAccount.private_key) {
        serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
      }
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
      });
      console.log('[Auth] Firebase Admin initialized with service account');
    } else {
      console.warn('[Auth] No service account found in env (FIREBASE_SERVICE_ACCOUNT_JSON or FIREBASE_SERVICE_ACCOUNT_JSON_B64). Firebase features might fail.');
      // Не вызываем initializeApp() без аргументов, так как это упадет без дефолтных кредов Google Cloud
    }
  } catch (error) {
    console.error('[Auth] Error initializing Firebase Admin:', error);
    // Не выходим, чтобы сервер мог запуститься и мы увидели логи
  }
}

export async function authMiddleware(req: Request, res: Response, next: NextFunction) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Missing token' });
    }

    const token = authHeader.split('Bearer ')[1];
    const decodedToken = await admin.auth().verifyIdToken(token);
    
    // UPSERT юзера в нашу БД (теперь у нас есть свой UUID юзера)
    const user = await usersRepository.upsertByGoogleId({
      googleId: decodedToken.uid,
      email: decodedToken.email || '',
      displayName: decodedToken.name || 'Unknown Traveler',
      avatarUrl: decodedToken.picture || null
    });

    req.user = user;
    next();
  } catch (error) {
    console.error('[Auth] Middleware Error:', error);
    res.status(401).json({ error: 'Unauthorized' });
  }
}
