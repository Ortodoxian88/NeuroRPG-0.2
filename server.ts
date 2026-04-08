import express from "express";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type, ThinkingLevel, HarmCategory, HarmBlockThreshold } from '@google/genai';
import path from "path";
import admin from 'firebase-admin';
import fs from 'fs';
import rateLimit from 'express-rate-limit';
import 'dotenv/config';

// Initialize Firebase Admin for token verification
const firebaseConfigPath = path.join(process.cwd(), 'firebase-applet-config.json');
if (fs.existsSync(firebaseConfigPath)) {
  const config = JSON.parse(fs.readFileSync(firebaseConfigPath, 'utf8'));
  admin.initializeApp({
    projectId: config.projectId
  });
} else {
  console.warn("firebase-applet-config.json not found, admin not initialized");
}

const requireAuth = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Unauthorized: Missing or invalid token' });
    return;
  }
  
  const token = authHeader.split('Bearer ')[1];
  try {
    const decodedToken = await admin.auth().verifyIdToken(token);
    (req as any).user = decodedToken;
    next();
  } catch (error) {
    console.error('Error verifying auth token:', error);
    res.status(401).json({ error: 'Unauthorized: Invalid token' });
  }
};

const apiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 20, // limit each IP to 20 requests per windowMs
  message: { error: "Too many requests, please try again later." }
});

const safetySettings = [
  { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_CIVIC_INTEGRITY, threshold: HarmBlockThreshold.BLOCK_NONE },
];

function getAIClient(): GoogleGenAI {
  const key = process.env.GEMINI_API_KEY || process.env.API_KEY;
  if (!key) {
    throw new Error("GEMINI_API_KEY environment variable is missing. Please check your secrets in AI Studio.");
  }
  return new GoogleGenAI({ apiKey: key });
}

async function generateWithFallback(prompt: string, baseConfig: any, models: string[] = ["gemini-3-flash-preview", "gemini-3.1-flash-lite-preview"]) {
  let lastError;
  const ai = getAIClient();

  const modelList = baseConfig.model ? [baseConfig.model, ...models.filter(m => m !== baseConfig.model)] : models;

  for (const modelName of modelList) {
    try {
      console.log(`[AI] Attempting generation with model: ${modelName}`);
      const config = { ...baseConfig };
      delete config.model;
      
      if (modelName === "gemini-3.1-flash-lite-preview" && config.thinkingConfig) {
        delete config.thinkingConfig;
      }

      const response = await ai.models.generateContent({
        model: modelName,
        contents: prompt,
        config: {
          ...config,
          safetySettings: safetySettings
        }
      });
      
      if (!response.text) {
        console.warn(`[AI] Model ${modelName} returned no text. Full response:`, JSON.stringify(response));
        throw new Error(`AI returned no text. Finish reason: ${response.candidates?.[0]?.finishReason}`);
      }
      
      console.log(`[AI] Successfully generated with ${modelName}`);
      return response.text;
    } catch (error: any) {
      console.warn(`[AI] Model ${modelName} failed: ${error.message || error}`);
      lastError = error;
      if (error.message?.includes("API key not valid")) throw error;
    }
  }

  throw lastError;
}

// Telegram Reporting logic moved inside startServer
async function startServer() {
  const app = express();
  const PORT = 3000;

  app.set('trust proxy', 1);
  app.use(express.json({ limit: '1mb' }));
  app.use('/api/', apiLimiter);

  // Fix for Firebase Auth popup Cross-Origin-Opener-Policy issues
  app.use((req, res, next) => {
    res.setHeader("Cross-Origin-Opener-Policy", "same-origin-allow-popups");
    res.setHeader("Cross-Origin-Embedder-Policy", "unsafe-none");
    next();
  });

  // Telegram Reporting
  app.post('/api/report', apiLimiter, async (req, res) => {
    const { type, message, userEmail, roomId, turn, version } = req.body;
    
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;

    if (!botToken || !chatId) {
      console.error('Telegram bot credentials missing');
      return res.status(500).json({ error: 'Reporting service unavailable' });
    }

    const escapeHtml = (unsafe: string) => {
      return unsafe
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
    };

    const safeMessage = escapeHtml(message);
    const safeUser = escapeHtml(userEmail || 'Аноним');
    const safeType = type.toUpperCase();

    const text = `
<b>🚀 Новый репорт: ${safeType}</b>
──────────────────
<b>От:</b> ${safeUser}
<b>Комната:</b> ${roomId || 'N/A'}
<b>Ход:</b> ${turn || 0}
<b>Версия:</b> ${version || '0.3.0'}

<b>Сообщение:</b>
<i>${safeMessage}</i>
    `.trim();

    try {
      const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: text,
          parse_mode: 'HTML'
        })
      });

      if (!response.ok) {
        throw new Error(`Telegram API error: ${response.statusText}`);
      }

      res.json({ success: true });
    } catch (error) {
      console.error('Failed to send report to Telegram:', error);
      res.status(500).json({ error: 'Failed to send report' });
    }
  });

  // API routes FIRST
  app.post("/api/gemini/join", requireAuth, async (req, res) => {
    try {
      const { characterName, characterProfile, roomId } = req.body;
      const prompt = `Проанализируй анкету RPG персонажа и извлеки логичный стартовый инвентарь, список навыков/способностей и определи его мировоззрение (alignment).
Имя персонажа: ${characterName}
Анкета: ${characterProfile}

Верни JSON объект с массивами "inventory" и "skills", а также строку "alignment" (например, "Законопослушный-Добрый", "Хаотично-Злой", "Истинно-Нейтральный"). Названия предметов и навыков должны быть на РУССКОМ языке. Будь краток.`;

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
      if (match) {
        jsonText = match[1];
      }
      
      const parsed = JSON.parse(jsonText);
      
      // Also post a system message to the room
      if (roomId) {
        const db = admin.firestore();
        await db.collection('rooms').doc(roomId).collection('messages').add({
          role: 'system',
          content: `Игрок **${characterName}** присоединился к игре.`,
          turn: 0,
          createdAt: admin.firestore.FieldValue.serverTimestamp()
        });
      }

      res.json(parsed);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Failed to generate" });
    }
  });

  app.post("/api/gemini/summarize", requireAuth, async (req, res) => {
    try {
      const { currentSummary, recentMessages, roomId } = req.body;
      const uid = (req as any).user.uid;
      
      // Verify host
      const db = admin.firestore();
      const roomDoc = await db.collection('rooms').doc(roomId).get();
      if (!roomDoc.exists || roomDoc.data()?.hostId !== uid) {
        return res.status(403).json({ error: "Only host can summarize" });
      }

      const prompt = `Ты летописец RPG игры. Твоя задача - обновить краткое содержание сюжета.
Текущее содержание: ${currentSummary || "Начало приключения."}
Новые события: ${recentMessages}

Напиши обновленное краткое содержание (не более 3-4 абзацев), сохраняя ключевые события и текущую цель героев. Пиши художественно, но емко.`;

      const aiText = await generateWithFallback(prompt, {
        // Use low thinking for summarization to save time if supported
      });

      res.json({ text: aiText });
    } catch (error) {
      console.error("Summarize error:", error);
      res.status(500).json({ error: "Failed to summarize" });
    }
  });

  app.post("/api/gemini/generate", requireAuth, async (req, res) => {
    try {
      const { playersContext, recentMessages, turn, actionsText, currentQuests, worldState, factions, hiddenTimers, gmTone, difficulty, goreLevel, language } = req.body;
      
      const tonePrompt = gmTone === 'grimdark' ? 'Стиль: Мрачное, жестокое фэнтези. Смерть близка, ресурсы скудны, мир враждебен.' :
                         gmTone === 'horror' ? 'Стиль: Лавкрафтовский ужас. Напряжение, безумие, необъяснимые явления, постоянное чувство опасности.' :
                         gmTone === 'epic' ? 'Стиль: Эпическая сага. Героические поступки, пафос, великие свершения, магия повсюду.' :
                         'Стиль: Классическое фэнтези. Сбалансированное приключение с юмором и опасностями.';

      const difficultyPrompt = difficulty === 'hardcore' ? 'Сложность: ХАРДКОР. ИИ должен быть максимально суров, ошибки игроков ведут к фатальным последствиям.' :
                               difficulty === 'hard' ? 'Сложность: ВЫСОКАЯ. Игроки должны чувствовать вызов, ресурсы ограничены.' :
                               'Сложность: НОРМАЛЬНАЯ/ЛЕГКАЯ. Сфокусируйся на истории и фане.';

      const gorePrompt = goreLevel === 'high' ? 'Уровень жестокости: ВЫСОКИЙ (R-rating). Описывай ранения, кровь и насилие максимально детально и красочно.' :
                         goreLevel === 'low' ? 'Уровень жестокости: НИЗКИЙ (PG-13). Избегай детальных описаний крови и насилия, фокусируйся на действии.' :
                         'Уровень жестокости: СРЕДНИЙ. Умеренные описания сражений без излишней детализации.';

      const langPrompt = language === 'en' ? 'RESPOND STRICTLY IN ENGLISH.' : 'ОТВЕЧАЙ СТРОГО НА РУССКОМ ЯЗЫКЕ.';

      const modelName = 'gemini-3-flash-preview';

      const prompt = `
Ты элитный ИИ-Гейм-мастер для многопользовательской текстовой RPG. Твоя цель - реалистично симулировать мир, управлять NPC и реагировать на действия игроков.
${langPrompt}

[НАСТРОЙКИ СЕССИИ]
${tonePrompt}
${difficultyPrompt}
${gorePrompt}

[КОНТЕКСТ МИРА]
Текущее состояние мира и экономики: ${worldState || 'Начало игры. Экономика стабильна.'}
Отношения фракций: ${factions ? JSON.stringify(factions) : '{}'}
Скрытые таймеры квестов: ${hiddenTimers ? JSON.stringify(hiddenTimers) : '{}'}

[ИГРОКИ В МИРЕ]
${playersContext}

[НЕДАВНИЙ КОНТЕКСТ ИСТОРИИ]
${recentMessages}

ТЕКУЩИЙ ХОД: ${turn}
ТЕКУЩИЕ КВЕСТЫ: ${currentQuests ? JSON.stringify(currentQuests) : '[]'}

[ДЕЙСТВИЯ ИГРОКОВ В ЭТОМ ХОДУ]
${actionsText}

[МЕХАНИКИ И ПРАВИЛА (СТРОГО СОБЛЮДАТЬ)]
1. Chain-of-Thought: Сначала напиши свои рассуждения в поле "reasoning". Оцени логику, физику магии, укрытия, вес инвентаря, скрытые броски.
2. Валидация действий и Анти-метагейминг: Пресекай попытки игроков сделать невозможное (godmode) или использовать знания из реального мира. Описывай провал таких действий органично.
3. Физика и Синергия: Магия взаимодействует с окружением (вода проводит ток, огонь сжигает дерево). Учитывай позиционирование и укрытия.
4. Экономика и Инфляция: Цены меняются динамически. Обновляй это в "worldUpdates".
5. Инвентарь: Учитывай логический вес. Нельзя нести 10 мечей.
6. Состояния и Травмы: Накладывай эффекты (Кровотечение, Отравление) и перманентные травмы (Шрамы, Хромота) при сильном уроне. Обновляй HP/MP/Стресс в "stateUpdates".
7. Психологический стресс и Мутации: В страшных ситуациях повышай стресс (0-100). При 100 - психоз. Накладывай скрытые мутации/проклятия. Обновляй это в "stateUpdates".
8. Мировоззрение и Репутация: Сдвигай мировоззрение (alignment) и репутацию у фракций/NPC в зависимости от поступков.
9. NPC: NPC могут лгать, обманывать (органично). Генерируй слухи в тавернах. Используй прямую речь от первого лица для важных NPC.
10. Квесты и Таймеры: Ветвящиеся квесты. Обновляй скрытые таймеры (hiddenTimersUpdates). Если таймер истек - событие происходит.
11. AI Director и Случайные встречи: Подстраивай сложность. Если скучно - генерируй органичную случайную встречу или загадку.
12. Моральные дилеммы: Изредка ставь игроков перед сложным выбором без правильного ответа.
13. Тональность: Анализируй тон чата, но оставайся беспристрастным. Если ситуация критическая, а игроки шутят - мир реагирует серьезно и жестоко.
14. Адаптивный лексикон: Подстраивай стиль речи под сеттинг (без кринжа).

[ИНСТРУКЦИИ ПО ФОРМАТУ]
Описывай происходящее ДЕТАЛЬНО, ГЛУБОКО и ХУДОЖЕСТВЕННО. Используй богатый литературный язык.
Заканчивай ход интригой или новым вызовом.
`;

      const aiText = await generateWithFallback(prompt, {
        model: modelName,
        thinkingConfig: { thinkingLevel: ThinkingLevel.HIGH },
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            reasoning: { type: Type.STRING, description: "Скрытые рассуждения ИИ, расчеты, скрытые броски, логика" },
            story: { type: Type.STRING, description: "Художественный текст ответа Гейм-мастера" },
            worldUpdates: { type: Type.STRING, description: "Обновленное состояние мира и экономики (для компендиума)" },
            factionUpdates: { type: Type.OBJECT, description: "Обновленные отношения фракций (Ключ: Название, Значение: Описание)" },
            hiddenTimersUpdates: { type: Type.OBJECT, description: "Обновленные таймеры (Ключ: Название события, Значение: Ходов осталось)" },
            stateUpdates: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  uid: { type: Type.STRING },
                  hp: { type: Type.NUMBER },
                  mana: { type: Type.NUMBER },
                  stress: { type: Type.NUMBER },
                  alignment: { type: Type.STRING },
                  inventory: { type: Type.ARRAY, items: { type: Type.STRING } },
                  skills: { type: Type.ARRAY, items: { type: Type.STRING } },
                  injuries: { type: Type.ARRAY, items: { type: Type.STRING } },
                  statuses: { type: Type.ARRAY, items: { type: Type.STRING } },
                  mutations: { type: Type.ARRAY, items: { type: Type.STRING } },
                  reputation: { type: Type.OBJECT, description: "Репутация у фракций/NPC (Ключ: Имя, Значение: Число от -100 до 100)" }
                },
                required: ["uid"]
              }
            },
            bestiary: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  title: { type: Type.STRING },
                  content: { type: Type.STRING }
                },
                required: ["title", "content"]
              }
            },
            quests: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: "Актуальный список активных квестов"
            }
          },
          required: ["reasoning", "story", "stateUpdates", "bestiary", "quests"]
        }
      }, ["gemini-3-flash-preview", "gemini-3.1-flash-lite-preview"]);

      let jsonText = aiText;
      
      let parsed;
      try {
        const match = jsonText.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
        if (match) {
          jsonText = match[1];
        }
        parsed = JSON.parse(jsonText);
      } catch (e) {
        console.error("Failed to parse JSON, attempting fallback extraction", e);
        // Fallback: try to find the first { and last }
        const firstBrace = jsonText.indexOf('{');
        const lastBrace = jsonText.lastIndexOf('}');
        if (firstBrace !== -1 && lastBrace !== -1) {
          try {
            parsed = JSON.parse(jsonText.substring(firstBrace, lastBrace + 1));
          } catch (innerError) {
            console.error("Fallback JSON parsing failed", innerError);
            throw new Error("Failed to parse AI response as JSON");
          }
        } else {
          throw new Error("No JSON object found in AI response");
        }
      }
      
      res.json(parsed);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Failed to generate GM response" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
