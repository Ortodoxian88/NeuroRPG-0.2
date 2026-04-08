import { Router } from 'express';
import { query } from '../database/client';
import { authMiddleware } from '../middleware/auth.middleware';
import { sseService } from '../services/sse.service';
import { messagesRepository } from '../database/repositories/messages.repository';

export const apiRouter = Router();

// --- SMOKE TESTS ---

apiRouter.get('/health/db', async (req, res) => {
  try {
    await query('SELECT 1');
    res.json({ ok: true, message: 'Database connection is healthy' });
  } catch (error: any) {
    console.error('DB Healthcheck failed:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

apiRouter.get('/health/auth', authMiddleware, (req, res) => {
  res.json({ 
    ok: true, 
    message: 'Authentication successful',
    user: req.user 
  });
});

// --- SSE REALTIME ---

apiRouter.get('/rooms/:roomId/events', authMiddleware, (req, res) => {
  const { roomId } = req.params;
  sseService.subscribe(roomId, res);
});

// --- ROOM MESSAGES ---

apiRouter.post('/rooms/:roomId/messages', authMiddleware, async (req, res) => {
  try {
    const { roomId } = req.params;
    const { content, type, turn_number, metadata } = req.body;

    // ВАЖНО: Проверяем тип сообщения под нашу схему БД
    const validTypes = ['player_action', 'ai_response', 'dice_roll', 'system', 'secret'];
    const messageType = validTypes.includes(type) ? type : 'system';

    const message = await messagesRepository.create({
      room_id: roomId,
      user_id: req.user!.id,
      type: messageType,
      content,
      metadata: metadata || {}, // В БД стоит NOT NULL DEFAULT '{}'
      turn_number: turn_number || 0
    });

    // Пушим всем в комнате через наш Realtime слой
    sseService.broadcast(roomId, 'message.new', message);

    res.status(201).json(message);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal Error' });
  }
});
