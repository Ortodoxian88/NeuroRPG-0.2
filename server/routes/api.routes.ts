import { Router } from 'express';
import { query } from '../database/client';
import { authMiddleware } from '../middleware/auth.middleware';
import { sseService } from '../services/sse.service';
import { messagesRepository } from '../database/repositories/messages.repository';
import { roomsRepository } from '../database/repositories/rooms.repository';
import { playersRepository } from '../database/repositories/players.repository';
import { bestiaryRepository } from '../database/repositories/bestiary.repository';
import { GoogleGenAI, Type, ThinkingLevel, HarmCategory, HarmBlockThreshold } from '@google/genai';
import { z } from 'zod';

console.log('[API] Registering routes...');

export const apiRouter = Router();

apiRouter.use((req, res, next) => {
  console.log(`[API] Request: ${req.method} ${req.path}`);
  next();
});

// --- AI CONFIG & SCHEMAS ---

const gameResponseSchema = z.object({
  reasoning: z.string(),
  story: z.string(),
  worldUpdates: z.string(),
  factionUpdates: z.record(z.string(), z.string()),
  hiddenTimersUpdates: z.record(z.string(), z.number()),
  stateUpdates: z.array(z.object({
    uid: z.string(),
    hp: z.number(),
    mana: z.number(),
    stress: z.number(),
    alignment: z.string(),
    inventory: z.array(z.string()),
    skills: z.array(z.string()),
    injuries: z.array(z.string()),
    statuses: z.array(z.string()),
    mutations: z.array(z.string()),
    reputation: z.record(z.string(), z.number()),
    stats: z.object({
      speed: z.number(),
      reaction: z.number(),
      strength: z.number(),
      power: z.number(),
      durability: z.number(),
      stamina: z.number()
    })
  })),
  wikiCandidates: z.array(z.object({
    name: z.string(),
    rawFacts: z.string(),
    reason: z.string()
  }))
});

const safetySettings = [
  { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_CIVIC_INTEGRITY, threshold: HarmBlockThreshold.BLOCK_NONE },
];

function getAIKeys(): string[] {
  const primaryKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
  const additionalKeys = process.env.GEMINI_API_KEYS ? process.env.GEMINI_API_KEYS.split(',').map(k => k.trim()).filter(k => k) : [];
  const allKeys = primaryKey ? [primaryKey, ...additionalKeys] : additionalKeys;
  return Array.from(new Set(allKeys));
}

async function generateWithFallback(prompt: string, baseConfig: any, models: string[] = ["gemini-3-flash-preview", "gemini-3.1-flash-lite-preview"]) {
  let lastError;
  const keys = getAIKeys();
  if (keys.length === 0) throw new Error("GEMINI_API_KEY is missing.");

  const modelList = baseConfig.model ? [baseConfig.model, ...models.filter(m => m !== baseConfig.model)] : models;

  for (const key of keys) {
    const ai = new GoogleGenAI({ apiKey: key });
    for (const modelName of modelList) {
      try {
        const config = { ...baseConfig };
        delete config.model;
        if (modelName === "gemini-3.1-flash-lite-preview" && config.thinkingConfig) delete config.thinkingConfig;

        const response = await ai.models.generateContent({
          model: modelName,
          contents: prompt,
          config: {
            ...config,
            safetySettings
          }
        });

        const text = response.text;
        if (!text) throw new Error(`AI returned no text.`);
        return text;
      } catch (error: any) {
        lastError = error;
        if (error.message?.includes("429") || error.message?.includes("API key not valid")) break;
        continue;
      }
    }
  }
  throw lastError;
}

async function generateWithValidation(prompt: string, baseConfig: any, attempt = 1): Promise<any> {
    const maxAttempts = 3;
    try {
        const rawResponse = await generateWithFallback(prompt, baseConfig);
        return gameResponseSchema.parse(JSON.parse(rawResponse));
    } catch (error) {
        if (attempt >= maxAttempts) throw error;
        const retryPrompt = `${prompt}\n\nПРЕДЫДУЩИЙ ОТВЕТ БЫЛ НЕВАЛИДНЫМ: ${error}. ПОЖАЛУЙСТА, ИСПРАВЬ ОШИБКИ И ВЕРНИ ВАЛИДНЫЙ JSON.`;
        return generateWithValidation(retryPrompt, baseConfig, attempt + 1);
    }
}

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

// --- REPORTING ---

apiRouter.post('/report', async (req, res) => {
  const { type, message, userEmail, roomId, turn, version } = req.body;
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!botToken || !chatId) return res.status(500).json({ error: 'Reporting service unavailable' });

  const escapeHtml = (unsafe: string) => unsafe.replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":"&#039;"}[m]!));
  const text = `<b>🚀 Новый репорт: ${escapeHtml(type.toUpperCase())}</b>\n<b>От:</b> ${escapeHtml(userEmail || 'Аноним')}\n<b>Комната:</b> ${roomId || 'N/A'}\n<b>Ход:</b> ${turn || 0}\n<b>Версия:</b> ${version || '0.3.0'}\n\n<b>Сообщение:</b>\n<i>${escapeHtml(message)}</i>`;

  try {
    await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' })
    });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to send report' });
  }
});

// --- ROOMS API ---

async function resolveRoom(identifier: string) {
  // Try finding by join_code first
  let room = await roomsRepository.findByJoinCode(identifier);
  if (!room) {
    // If it's a valid UUID, try finding by ID
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(identifier)) {
      room = await roomsRepository.findById(identifier);
    }
  }
  return room;
}

apiRouter.post('/rooms', authMiddleware, async (req, res) => {
  try {
    const { scenario } = req.body;
    const room = await roomsRepository.createRoom(req.user!.id, { scenario });
    res.status(201).json(room);
  } catch (error) {
    console.error('[API] Error in POST /rooms:', error);
    res.status(500).json({ error: 'Failed to create room' });
  }
});

apiRouter.get('/rooms', authMiddleware, async (req, res) => {
  try {
    const userId = req.user!.id;
    // Get rooms where user is host OR player
    const result = await query(
      `SELECT DISTINCT r.* FROM rooms r
       LEFT JOIN room_players rp ON rp.room_id = r.id
       WHERE r.host_user_id::text = $1 OR rp.user_id::text = $1
       ORDER BY r.created_at DESC LIMIT 20`,
      [userId]
    );
    res.json(result.rows);
  } catch (error) {
    console.error('[API] Error in GET /rooms:', error);
    res.status(500).json({ error: 'Failed to fetch rooms' });
  }
});

apiRouter.get('/rooms/:roomId', authMiddleware, async (req, res) => {
  try {
    const room = await resolveRoom(req.params.roomId);
    if (!room) return res.status(404).json({ error: 'Room not found' });
    res.json(room);
  } catch (error) {
    console.error(`[API] Error in GET /rooms/${req.params.roomId}:`, error);
    res.status(500).json({ error: 'Failed to fetch room' });
  }
});

apiRouter.post('/rooms/:roomId/start', authMiddleware, async (req, res) => {
  try {
    const { roomId: roomIdentifier } = req.params;
    const room = await resolveRoom(roomIdentifier);
    if (!room) return res.status(404).json({ error: 'Room not found' });
    if (room.host_user_id !== req.user!.id) return res.status(403).json({ error: 'Only host can start' });
    
    await roomsRepository.updateStatus(room.id, 'playing');
    await roomsRepository.updateTurn(room.id, 1, 'waiting', '');
    
    sseService.broadcast(room.id, 'room.updated', { ...room, status: 'playing', turn_number: 1 });
    res.json({ success: true });
  } catch (error) {
    console.error(`[API] Error in POST /rooms/${req.params.roomId}/start:`, error);
    res.status(500).json({ error: 'Failed to start room' });
  }
});

apiRouter.post('/rooms/join', authMiddleware, async (req, res) => {
  try {
    const { joinCode, characterName, characterProfile, stats, inventory, skills, alignment } = req.body;
    
    const room = await resolveRoom(joinCode);
    
    if (!room) return res.status(404).json({ error: 'Room not found or invalid code' });
    
    // Check if player already exists
    const existingPlayer = await playersRepository.findByRoomAndUser(room.id, req.user!.id);
    if (existingPlayer) {
      return res.json({ room, player: existingPlayer });
    }

    // Create player
    const player = await playersRepository.create({
      room_id: room.id,
      user_id: req.user!.id,
      character_name: characterName,
      character_profile: characterProfile,
      hp: 100, hp_max: 100,
      mana: 50, mana_max: 50,
      stress: 0, stress_max: 100,
      stat_strength: stats?.strength || 10,
      stat_dexterity: stats?.speed || 10,
      stat_constitution: stats?.durability || 10,
      stat_intelligence: stats?.reaction || 10,
      stat_wisdom: stats?.power || 10,
      stat_charisma: stats?.stamina || 10,
      inventory: inventory || [],
      skills: skills || [],
      statuses: [],
      injuries: [],
      alignment: alignment || null,
      mutations: [],
      reputation: {},
      current_action: null,
      is_ready: false,
      is_online: true,
      last_active_at: new Date()
    });

    // Notify room
    sseService.broadcast(room.id, 'player.joined', player);
    
    res.json({ room, player });
  } catch (error) {
    console.error('[API] Error in POST /rooms/join:', error);
    res.status(500).json({ error: 'Failed to join room' });
  }
});

// --- PLAYERS API ---

apiRouter.get('/rooms/:roomId/players', authMiddleware, async (req, res) => {
  try {
    const room = await resolveRoom(req.params.roomId);
    if (!room) return res.status(404).json({ error: 'Room not found' });
    const players = await playersRepository.findByRoom(room.id);
    res.json(players);
  } catch (error) {
    console.error(`[API] Error in GET /rooms/${req.params.roomId}/players:`, error);
    res.status(500).json({ error: 'Failed to fetch players' });
  }
});

apiRouter.post('/rooms/:roomId/players/action', authMiddleware, async (req, res) => {
  try {
    const { action, isHidden } = req.body;
    const { roomId: roomIdentifier } = req.params;
    
    const room = await resolveRoom(roomIdentifier);
    if (!room) return res.status(404).json({ error: 'Room not found' });

    const player = await playersRepository.findByRoomAndUser(room.id, req.user!.id);
    if (!player) return res.status(404).json({ error: 'Player not found in room' });

    const updatedPlayer = await playersRepository.updateAction(player.id, action, true);
    
    // Broadcast player update
    sseService.broadcast(room.id, 'player.updated', updatedPlayer);
    
    res.json(updatedPlayer);
  } catch (error) {
    console.error(`[API] Error in POST /rooms/${req.params.roomId}/players/action:`, error);
    res.status(500).json({ error: 'Failed to submit action' });
  }
});

apiRouter.post('/rooms/:roomId/players/update', authMiddleware, async (req, res) => {
  try {
    const { roomId: roomIdentifier } = req.params;
    const updates = req.body;
    
    const room = await resolveRoom(roomIdentifier);
    if (!room) return res.status(404).json({ error: 'Room not found' });

    const player = await playersRepository.findByRoomAndUser(room.id, req.user!.id);
    if (!player) return res.status(404).json({ error: 'Player not found in room' });

    const updatedPlayer = await playersRepository.updateState(player.id, updates);
    
    // Broadcast player update
    sseService.broadcast(room.id, 'player.updated', updatedPlayer);
    
    res.json(updatedPlayer);
  } catch (error) {
    console.error(`[API] Error in POST /rooms/${req.params.roomId}/players/update:`, error);
    res.status(500).json({ error: 'Failed to update player' });
  }
});

// --- SSE REALTIME ---

apiRouter.get('/rooms/:roomId/events', authMiddleware, async (req, res) => {
  const { roomId: roomIdentifier } = req.params;
  const room = await resolveRoom(roomIdentifier);
  if (!room) return res.status(404).json({ error: 'Room not found' });
  
  // Security check: Only host or players in the room can subscribe
  const player = await playersRepository.findByRoomAndUser(room.id, req.user!.id);
  if (!player && room.host_user_id !== req.user!.id) {
    return res.status(403).json({ error: 'Not authorized to view this room' });
  }
  
  sseService.subscribe(room.id, res);
});

// --- BESTIARY API ---

apiRouter.get('/bestiary', authMiddleware, async (req, res) => {
  try {
    const { search = '', category } = req.query;
    const entries = await bestiaryRepository.search(String(search), category ? String(category) : undefined);
    res.json(entries);
  } catch (error) {
    console.error('[API] Error in GET /bestiary:', error);
    res.status(500).json({ error: 'Failed to fetch bestiary' });
  }
});

// --- GEMINI / GAME LOGIC ---

apiRouter.post("/gemini/join", authMiddleware, async (req, res) => {
  try {
    const { characterName, characterProfile, roomId } = req.body;
    const prompt = `Проанализируй анкету RPG персонажа и извлеки логичный стартовый инвентарь, список навыков/способностей и определи его мировоззрение (alignment).\nИмя персонажа: ${characterName}\nАнкета: ${characterProfile}\n\nВерни JSON объект с массивами "inventory" и "skills", а также строку "alignment". Названия должны быть на РУССКОМ языке.`;

    const text = await generateWithFallback(prompt, {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          inventory: { type: Type.ARRAY, items: { type: Type.STRING } },
          skills: { type: Type.ARRAY, items: { type: Type.STRING } },
          alignment: { type: Type.STRING }
        },
        required: ["inventory", "skills", "alignment"]
      }
    });

    let jsonText = text;
    const match = jsonText.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    if (match) jsonText = match[1];
    const parsed = JSON.parse(jsonText);
    
    if (roomId) {
      const room = await roomsRepository.findById(roomId);
      if (room) {
        const message = await messagesRepository.create({
          room_id: roomId,
          user_id: null,
          type: 'system',
          content: `Игрок **${characterName}** присоединился к игре.`,
          turn_number: room.turn_number,
          metadata: {}
        });
        sseService.broadcast(roomId, 'message.new', message);
      }
    }

    res.json(parsed);
  } catch (error) {
    res.status(500).json({ error: "Failed to generate" });
  }
});

apiRouter.post("/gemini/summarize", authMiddleware, async (req, res) => {
  try {
    const { currentSummary, recentMessages, roomId } = req.body;
    const uid = req.user!.id;
    
    const room = await roomsRepository.findById(roomId);
    if (!room || room.host_user_id !== uid) {
      return res.status(403).json({ error: "Only host can summarize" });
    }

    const prompt = `Ты летописец RPG игры. Твоя задача - обновить краткое содержание сюжета.\nТекущее содержание: ${currentSummary || "Начало приключения."}\nНовые события: ${recentMessages}\n\nНапиши обновленное краткое содержание (не более 3-4 абзацев).`;

    const aiText = await generateWithFallback(prompt, { model: "gemini-3.1-flash-lite-preview" });
    
    await query('UPDATE rooms SET story_summary = $1 WHERE id = $2', [aiText, roomId]);
    
    res.json({ text: aiText });
  } catch (error) {
    res.status(500).json({ error: "Failed to summarize" });
  }
});

apiRouter.post("/gemini/generate", authMiddleware, async (req, res) => {
  try {
    const { roomId, playersContext, recentMessages, turn, actionsText, currentQuests, worldState, factions, hiddenTimers, gmTone, difficulty, goreLevel, language } = req.body;

    const room = await roomsRepository.findById(roomId);
    if (!room) return res.status(404).json({ error: 'Room not found' });

    // Mark room as generating
    await query('UPDATE rooms SET turn_status = $1 WHERE id = $2', ['generating', roomId]);
    sseService.broadcast(roomId, 'room.updated', { ...room, turn_status: 'generating' });

    const prompt = `Ты — ГМ в текстовой RPG. Обработай действия игроков, развивай сюжет, обновляй мир.

КОНТЕКСТ:
- Тон: ${gmTone}, Сложность: ${difficulty}, Жестокость: ${goreLevel}, Язык: ${language}
- Мир: ${worldState || 'Начало'}
- Квесты: ${JSON.stringify(currentQuests || [])}
- Фракции: ${JSON.stringify(factions || {})}
- Игроки: ${JSON.stringify(playersContext || [])}
- События: ${recentMessages}
- Действия: ${actionsText}

ЗАДАЧА:
1. Опиши последствия действий с учетом характеристик игроков.
2. Обнови состояние игроков, мира, фракций и таймеров.
3. Выдели важные факты для энциклопедии (wikiCandidates).

ВЕРНИ JSON (по схеме):
{
  "reasoning": "Твои скрытые мысли как ГМ",
  "story": "Художественное описание результатов хода",
  "worldUpdates": "Обновление мира",
  "factionUpdates": { "Фракция": "Статус" },
  "hiddenTimersUpdates": { "Таймер": 1 },
  "stateUpdates": [
    {
      "uid": "ID игрока",
      "hp": 100, "mana": 50, "stress": 0, "alignment": "Neutral",
      "inventory": ["Предмет"], "skills": ["Навык"],
      "injuries": [], "statuses": [], "mutations": [],
      "reputation": {},
      "stats": { "speed": 10, "reaction": 10, "strength": 10, "power": 10, "durability": 10, "stamina": 10 }
    }
  ],
  "wikiCandidates": [
    { "name": "Название", "rawFacts": "Факты", "reason": "Почему важно" }
  ]
}`;

    const result = await generateWithValidation(prompt, {
      model: 'gemini-3-flash-preview',
      responseMimeType: "application/json"
    });

    // Save AI message
    const aiMessage = await messagesRepository.create({
      room_id: roomId,
      user_id: null,
      type: 'ai_response',
      content: result.story,
      turn_number: room.turn_number,
      metadata: { reasoning: result.reasoning }
    });
    sseService.broadcast(roomId, 'message.new', aiMessage);

    // Update players
    if (result.stateUpdates && Array.isArray(result.stateUpdates)) {
      for (const update of result.stateUpdates) {
        const player = await playersRepository.findByRoomAndUser(roomId, update.uid);
        if (player) {
          const updatedPlayer = await playersRepository.updateState(player.id, {
            hp: update.hp,
            mana: update.mana,
            stress: update.stress,
            alignment: update.alignment,
            inventory: update.inventory,
            skills: update.skills,
            injuries: update.injuries,
            statuses: update.statuses,
            mutations: update.mutations,
            reputation: update.reputation
          });
          if (updatedPlayer) {
            sseService.broadcast(roomId, 'player.updated', updatedPlayer);
          }
        }
      }
    }

    // Reset player readiness
    const players = await playersRepository.findByRoom(roomId);
    for (const p of players) {
      const updatedPlayer = await playersRepository.updateAction(p.id, '', false);
      if (updatedPlayer) {
        sseService.broadcast(roomId, 'player.updated', updatedPlayer);
      }
    }

    // Update room
    const newTurn = room.turn_number + 1;
    const worldSettings = room.world_settings || {};
    worldSettings.worldState = result.worldUpdates || worldSettings.worldState;
    worldSettings.factions = result.factionUpdates || worldSettings.factions;
    worldSettings.hiddenTimers = result.hiddenTimersUpdates || worldSettings.hiddenTimers;

    await query(
      'UPDATE rooms SET turn_number = $1, turn_status = $2, active_quests = $3, world_settings = $4 WHERE id = $5',
      [newTurn, 'waiting', JSON.stringify(result.quests || room.active_quests || []), JSON.stringify(worldSettings), roomId]
    );

    const updatedRoom = await roomsRepository.findById(roomId);
    sseService.broadcast(roomId, 'room.updated', updatedRoom);

    res.json(result);
  } catch (error) {
    console.error('[AI] Generation error:', error);
    if (req.body.roomId) {
      await query('UPDATE rooms SET turn_status = $1 WHERE id = $2', ['waiting', req.body.roomId]);
      const updatedRoom = await roomsRepository.findById(req.body.roomId);
      sseService.broadcast(req.body.roomId, 'room.updated', updatedRoom);
    }
    res.status(500).json({ error: "Failed to generate GM response" });
  }
});

apiRouter.post("/gemini/archivist", authMiddleware, async (req, res) => {
  try {
    const { candidates, roomId } = req.body;
    const uid = req.user!.id;

    if (!candidates || !Array.isArray(candidates) || candidates.length === 0) {
      return res.json({ success: true });
    }

    for (const candidate of candidates) {
      try {
        // Check if entry already exists
        const existingEntries = await bestiaryRepository.search(candidate.name);
        // Find exact match
        const existingEntry = existingEntries.find(e => e.title.toLowerCase() === candidate.name.toLowerCase());

        const prompt = `Ты - Магистр Элиас, Архивариус и летописец. Тебе принесли сырые факты о сущности/объекте/локации.
Твоя задача - решить, достойно ли это записи в Великую Энциклопедию (Википедию).
Если это банальщина (обычный волк, простой камень, крестьянин), верни JSON: {"rejected": true, "reason": "Слишком банально"}.
Если это достойно, напиши подробную, научную и атмосферную статью.
Не создавай отдельные статьи для каждого подвида (например, разных гоблинов или вариаций одного меча). Если это подвид, обновляй основную статью, добавляя фразу "преобладает разнообразием" и описывая новые виды там.

Имя: ${candidate.name}
Сырые факты: ${candidate.rawFacts}
Причина добавления от разведчиков: ${candidate.reason}
${existingEntry ? `У нас уже есть запись об этом:\n${existingEntry.content}\nДОПОЛНИ ЕЁ новыми фактами, если они есть, и повысь уровень знаний.` : 'Это новая запись.'}

Верни СТРОГО JSON объект:
{
  "rejected": false,
  "category": "Флора" | "Фауна" | "Артефакты" | "Магические Аномалии" | "Фракции" | "Исторические Личности" | "Локации" | "Заклинания",
  "nature": "positive" | "negative" | "neutral",
  "tags": ["тег1", "тег2"],
  "level": 1 | 2 | 3, // 1 - внешний вид, 2 - повадки/свойства, 3 - полная анатомия/секреты
  "content": "Текст статьи в формате Markdown. Пиши от лица Магистра Элиаса, используй научный, но фэнтезийный стиль.",
  "authorNotes": "Короткая сноска или комментарий от автора (опционально)"
}`;

        const text = await generateWithFallback(prompt, {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              rejected: { type: Type.BOOLEAN },
              reason: { type: Type.STRING },
              category: { type: Type.STRING },
              nature: { type: Type.STRING },
              tags: { type: Type.ARRAY, items: { type: Type.STRING } },
              level: { type: Type.NUMBER },
              content: { type: Type.STRING },
              authorNotes: { type: Type.STRING }
            }
          }
        });

        let jsonText = text;
        const match = jsonText.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
        if (match) jsonText = match[1];
        const parsed = JSON.parse(jsonText);

        if (parsed.rejected) {
          console.log(`Archivist rejected ${candidate.name}: ${parsed.reason}`);
          continue;
        }

        if (existingEntry) {
          await query(
            'UPDATE bestiary SET category = $1, nature = $2, tags = $3, knowledge_level = $4, content = $5, author_notes = $6 WHERE id = $7',
            [parsed.category, parsed.nature || 'neutral', JSON.stringify(parsed.tags || []), parsed.level, parsed.content, parsed.authorNotes || null, existingEntry.id]
          );
        } else {
          await bestiaryRepository.create({
            slug: candidate.name.toLowerCase().replace(/\s+/g, '-'),
            title: candidate.name,
            category: parsed.category,
            nature: parsed.nature || 'neutral',
            tags: parsed.tags,
            knowledge_level: parsed.level,
            content: parsed.content,
            author_notes: parsed.authorNotes || null,
            source_room_id: roomId,
            discovered_by_user_id: req.user!.id
          });
        }
      } catch (error) {
        console.error(`Failed to process wiki candidate ${candidate.name}:`, error);
      }
    }

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Failed to process archivist candidates" });
  }
});

// --- ROOM MESSAGES ---

apiRouter.get('/rooms/:roomId/messages', authMiddleware, async (req, res) => {
  try {
    const { roomId: roomIdentifier } = req.params;
    const { limit = 50, offset = 0 } = req.query;

    const room = await resolveRoom(roomIdentifier);
    if (!room) return res.status(404).json({ error: 'Room not found' });

    const messages = await messagesRepository.findByRoom(room.id, Number(limit), Number(offset));
    res.json(messages);
  } catch (error) {
    console.error(`[API] Error in GET /rooms/${req.params.roomId}/messages:`, error);
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

apiRouter.post('/rooms/:roomId/messages', authMiddleware, async (req, res) => {
  try {
    const { roomId: roomIdentifier } = req.params;
    const { content, type, turn_number, metadata } = req.body;
    const validTypes = ['player_action', 'ai_response', 'dice_roll', 'system', 'secret'];
    const messageType = validTypes.includes(type) ? type : 'system';

    const room = await resolveRoom(roomIdentifier);
    if (!room) return res.status(404).json({ error: 'Room not found' });

    const message = await messagesRepository.create({
      room_id: room.id,
      user_id: req.user!.id,
      type: messageType,
      content,
      metadata: metadata || {},
      turn_number: turn_number || 0
    });

    sseService.broadcast(room.id, 'message.new', message);
    res.status(201).json(message);
  } catch (error) {
    res.status(500).json({ error: 'Internal Error' });
  }
});
