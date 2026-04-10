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

const createRoomSchema = z.object({
  scenario: z.string().min(1).max(2000),
});

const joinRoomSchema = z.object({
  joinCode: z.string().min(1),
  characterName: z.string().min(1),
  characterProfile: z.string().min(1),
  stats: z.object({
    strength: z.number().optional(),
    speed: z.number().optional(),
    durability: z.number().optional(),
    reaction: z.number().optional(),
    power: z.number().optional(),
    stamina: z.number().optional(),
  }).optional(),
  inventory: z.array(z.string()).optional(),
  skills: z.array(z.string()).optional(),
  alignment: z.string().optional(),
});

const playerActionSchema = z.object({
  action: z.string().min(1),
  isHidden: z.boolean().optional(),
});

const playerUpdateSchema = z.record(z.string(), z.any()); // Simplified for now as it can be any update

const geminiJoinSchema = z.object({
  characterName: z.string().min(1),
  characterProfile: z.string().min(1),
  roomId: z.string().optional(),
});

const geminiSummarizeSchema = z.object({
  currentSummary: z.string().optional(),
  recentMessages: z.string().min(1),
  roomId: z.string().min(1),
});

const geminiGenerateSchema = z.object({
  roomId: z.string().min(1),
  playersContext: z.array(z.any()),
  recentMessages: z.string(),
  turn: z.number(),
  actionsText: z.string(),
  currentQuests: z.array(z.any()).optional(),
  worldState: z.string().optional(),
  factions: z.record(z.string(), z.any()).optional(),
  hiddenTimers: z.record(z.string(), z.any()).optional(),
  gmTone: z.string(),
  difficulty: z.string(),
  goreLevel: z.string(),
  language: z.string(),
});

const geminiArchivistSchema = z.object({
  candidates: z.array(z.object({
    name: z.string(),
    rawFacts: z.string(),
    reason: z.string(),
  })),
  roomId: z.string().min(1),
});

const createMessageSchema = z.object({
  content: z.string().min(1),
  type: z.string().optional(),
  turn_number: z.number().optional(),
  metadata: z.record(z.string(), z.any()).optional(),
});

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

apiRouter.post('/rooms', authMiddleware, async (req, res, next) => {
  try {
    const { scenario } = createRoomSchema.parse(req.body);
    const room = await roomsRepository.createRoom(req.user!.id, { scenario });
    res.status(201).json(room);
  } catch (error) {
    next(error);
  }
});

apiRouter.get('/rooms', authMiddleware, async (req, res, next) => {
  try {
    const userId = req.user!.id;
    // Get rooms where user is host OR player
    const result = await query(
      `SELECT DISTINCT r.* FROM rooms r
       LEFT JOIN room_players rp ON rp.room_id = r.id
       WHERE r.host_user_id = $1 OR rp.user_id = $1
       ORDER BY r.created_at DESC LIMIT 20`,
      [userId]
    );
    res.json(result.rows);
  } catch (error) {
    next(error);
  }
});

apiRouter.get('/rooms/:roomId', authMiddleware, async (req, res, next) => {
  try {
    const room = await roomsRepository.findById(req.params.roomId);
    if (!room) return res.status(404).json({ error: 'Room not found' });
    res.json(room);
  } catch (error) {
    next(error);
  }
});

apiRouter.post('/rooms/:roomId/start', authMiddleware, async (req, res, next) => {
  try {
    const { roomId } = req.params;
    const room = await roomsRepository.findById(roomId);
    if (!room) return res.status(404).json({ error: 'Room not found' });
    if (room.host_user_id !== req.user!.id) return res.status(403).json({ error: 'Only host can start' });
    
    await roomsRepository.updateStatus(roomId, 'playing');
    await roomsRepository.updateTurn(roomId, 1, 'waiting', '');
    
    sseService.broadcast(roomId, 'room.updated', { ...room, status: 'playing', turn_number: 1 });
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

apiRouter.post('/rooms/join', authMiddleware, async (req, res, next) => {
  try {
    const { joinCode, characterName, characterProfile, stats, inventory, skills, alignment } = joinRoomSchema.parse(req.body);
    const room = await roomsRepository.findByJoinCode(joinCode);
    
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
    next(error);
  }
});

// --- PLAYERS API ---

apiRouter.get('/rooms/:roomId/players', authMiddleware, async (req, res, next) => {
  try {
    const room = await roomsRepository.findById(req.params.roomId);
    if (!room) return res.status(404).json({ error: 'Room not found' });
    const players = await playersRepository.findByRoom(room.id);
    res.json(players);
  } catch (error) {
    next(error);
  }
});

apiRouter.post('/rooms/:roomId/players/action', authMiddleware, async (req, res, next) => {
  try {
    const { action, isHidden } = playerActionSchema.parse(req.body);
    const { roomId: roomIdentifier } = req.params;
    
    const room = await roomsRepository.findById(roomIdentifier);
    if (!room) return res.status(404).json({ error: 'Room not found' });

    const player = await playersRepository.findByRoomAndUser(room.id, req.user!.id);
    if (!player) return res.status(404).json({ error: 'Player not found in room' });

    const updatedPlayer = await playersRepository.updateAction(player.id, action, true);
    
    // Broadcast player update
    sseService.broadcast(room.id, 'player.updated', updatedPlayer);
    
    res.json(updatedPlayer);
  } catch (error) {
    next(error);
  }
});

apiRouter.post('/rooms/:roomId/players/update', authMiddleware, async (req, res, next) => {
  try {
    const { roomId: roomIdentifier } = req.params;
    const updates = playerUpdateSchema.parse(req.body);
    
    const room = await roomsRepository.findById(roomIdentifier);
    if (!room) return res.status(404).json({ error: 'Room not found' });

    const player = await playersRepository.findByRoomAndUser(room.id, req.user!.id);
    if (!player) return res.status(404).json({ error: 'Player not found in room' });

    const updatedPlayer = await playersRepository.updateState(player.id, updates);
    
    // Broadcast player update
    sseService.broadcast(room.id, 'player.updated', updatedPlayer);
    
    res.json(updatedPlayer);
  } catch (error) {
    next(error);
  }
});

// --- SSE REALTIME ---

// --- SSE REALTIME ---

apiRouter.get('/rooms/:roomId/events', authMiddleware, async (req, res, next) => {
  try {
    const { roomId: roomIdentifier } = req.params;
    const room = await roomsRepository.findById(roomIdentifier);
    if (!room) return res.status(404).json({ error: 'Room not found' });
    sseService.subscribe(room.id, res);
  } catch (error) {
    next(error);
  }
});

// --- BESTIARY API ---

apiRouter.get('/bestiary', authMiddleware, async (req, res, next) => {
  try {
    const { search = '', category } = req.query;
    const entries = await bestiaryRepository.search(String(search), category ? String(category) : undefined);
    res.json(entries);
  } catch (error) {
    next(error);
  }
});

// --- GEMINI / GAME LOGIC ---

apiRouter.post("/gemini/join", authMiddleware, async (req, res, next) => {
  try {
    const { characterName, characterProfile, roomId } = geminiJoinSchema.parse(req.body);
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
    next(error);
  }
});

apiRouter.post("/gemini/summarize", authMiddleware, async (req, res, next) => {
  try {
    const { currentSummary, recentMessages, roomId } = geminiSummarizeSchema.parse(req.body);
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
    next(error);
  }
});

apiRouter.post("/gemini/generate", authMiddleware, async (req, res, next) => {
  try {
    const { roomId, playersContext, recentMessages, turn, actionsText, currentQuests, worldState, factions, hiddenTimers, gmTone, difficulty, goreLevel, language } = geminiGenerateSchema.parse(req.body);

    const room = await roomsRepository.findById(roomId);
    if (!room) return res.status(404).json({ error: 'Room not found' });

    // Mark room as generating
    await query('UPDATE rooms SET turn_status = $1 WHERE id = $2', ['generating', roomId]);
    sseService.broadcast(roomId, 'room.updated', { ...room, turn_status: 'generating' });

    const prompt = `Ты — Мастер Игры (Game Master) в текстовой RPG.
Твоя задача — обрабатывать действия игроков, развивать сюжет и обновлять состояние мира.

НАСТРОЙКИ ИГРЫ:
- Тон: ${gmTone}
- Сложность: ${difficulty}
- Жестокость: ${goreLevel}
- Язык ответа: ${language}

СОСТОЯНИЕ МИРА:
${worldState || 'Начало игры.'}

ТЕКУЩИЕ КВЕСТЫ:
${JSON.stringify(currentQuests || [])}

ФРАКЦИИ:
${JSON.stringify(factions || {})}

ИГРОКИ:
${JSON.stringify(playersContext || [])}

ПОСЛЕДНИЕ СОБЫТИЯ:
${recentMessages}

ДЕЙСТВИЯ ИГРОКОВ В ЭТОМ ХОДУ:
${actionsText}

ИНСТРУКЦИЯ:
1. Проанализируй действия игроков. Учитывай их инвентарь, навыки и характеристики.
2. Опиши результаты их действий (успех/провал) и реакцию мира.
3. Обнови состояние каждого игрока (HP, мана, инвентарь и т.д.), если оно изменилось.
4. Обнови состояние мира, фракций и скрытых таймеров.
5. Если произошло что-то важное, добавь это в wikiCandidates.

ВЕРНИ СТРОГИЙ JSON, СООТВЕТСТВУЮЩИЙ СЛЕДУЮЩЕЙ СХЕМЕ:
{
  "reasoning": "Твои скрытые мысли как ГМ (не видны игрокам)",
  "story": "Художественное описание результатов хода (визуализируется для игроков)",
  "worldUpdates": "Обновленное описание состояния мира (если изменилось)",
  "factionUpdates": { "Название Фракции": "Новое отношение/статус" },
  "hiddenTimersUpdates": { "Название Таймера": 1 },
  "stateUpdates": [
    {
      "uid": "ID игрока (из playersContext)",
      "hp": 100,
      "mana": 50,
      "stress": 0,
      "alignment": "Neutral",
      "inventory": ["Предмет 1"],
      "skills": ["Навык 1"],
      "injuries": [],
      "statuses": [],
      "mutations": [],
      "reputation": {},
      "stats": { "speed": 10, "reaction": 10, "strength": 10, "power": 10, "durability": 10, "stamina": 10 }
    }
  ],
  "wikiCandidates": [
    { "name": "Название статьи", "rawFacts": "Факты", "reason": "Почему это важно" }
  ]
}`;

    const result = await generateWithValidation(prompt, {
      model: 'gemini-3-flash-preview',
      thinkingConfig: { thinkingLevel: ThinkingLevel.HIGH },
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
      [newTurn, 'waiting', result.quests || room.active_quests, worldSettings, roomId]
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
    next(error);
  }
});

apiRouter.post("/gemini/archivist", authMiddleware, async (req, res, next) => {
  try {
    const { candidates, roomId } = geminiArchivistSchema.parse(req.body);
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
            [parsed.category, parsed.nature || 'neutral', parsed.tags, parsed.level, parsed.content, parsed.authorNotes || null, existingEntry.id]
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
    next(error);
  }
});

// --- ROOM MESSAGES ---

apiRouter.get('/rooms/:roomId/messages', authMiddleware, async (req, res, next) => {
  try {
    const { roomId: roomIdentifier } = req.params;
    const { limit = 50, offset = 0 } = req.query;

    const room = await roomsRepository.findById(roomIdentifier);
    if (!room) return res.status(404).json({ error: 'Room not found' });

    const messages = await messagesRepository.findByRoom(room.id, Number(limit), Number(offset));
    res.json(messages);
  } catch (error) {
    next(error);
  }
});

apiRouter.post('/rooms/:roomId/messages', authMiddleware, async (req, res, next) => {
  try {
    const { roomId: roomIdentifier } = req.params;
    const { content, type, turn_number, metadata } = createMessageSchema.parse(req.body);
    const validTypes = ['player_action', 'ai_response', 'dice_roll', 'system', 'secret'];
    const messageType = validTypes.includes(type) ? type : 'system';

    const room = await roomsRepository.findById(roomIdentifier);
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
    next(error);
  }
});
