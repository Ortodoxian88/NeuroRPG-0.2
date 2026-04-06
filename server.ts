import express from "express";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type, ThinkingLevel } from '@google/genai';
import path from "path";
import admin from 'firebase-admin';
import fs from 'fs';
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

  for (const model of models) {
    try {
      console.log(`[AI] Attempting generation with model: ${model}`);
      const config = { ...baseConfig };
      
      // Remove thinkingConfig for lite model as it defaults to MINIMAL and might reject HIGH
      if (model === "gemini-3.1-flash-lite-preview" && config.thinkingConfig) {
        delete config.thinkingConfig;
      }

      const response = await ai.models.generateContent({
        model: model,
        contents: prompt,
        config: config
      });
      
      console.log(`[AI] Successfully generated with ${model}`);
      return response;
    } catch (error: any) {
      console.warn(`[AI] Model ${model} failed: ${error.message || error}`);
      lastError = error;
    }
  }

  throw lastError;
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '1mb' }));

  // Fix for Firebase Auth popup Cross-Origin-Opener-Policy issues
  app.use((req, res, next) => {
    res.setHeader("Cross-Origin-Opener-Policy", "same-origin-allow-popups");
    res.setHeader("Cross-Origin-Embedder-Policy", "unsafe-none");
    next();
  });

  // API routes FIRST
  app.post("/api/gemini/join", requireAuth, async (req, res) => {
    try {
      const { characterName, characterProfile } = req.body;
      const prompt = `Проанализируй анкету RPG персонажа и извлеки логичный стартовый инвентарь и список навыков/способностей.
Имя персонажа: ${characterName}
Анкета: ${characterProfile}

Верни JSON объект с двумя массивами строк: "inventory" и "skills". Названия предметов и навыков должны быть на РУССКОМ языке. Будь краток.`;

      const response = await generateWithFallback(prompt, {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            inventory: { type: Type.ARRAY, items: { type: Type.STRING } },
            skills: { type: Type.ARRAY, items: { type: Type.STRING } }
          },
          required: ["inventory", "skills"]
        }
      });

      let text = response.text || '{"inventory":[], "skills":[]}';
      const match = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
      if (match) {
        text = match[1];
      }
      
      const parsed = JSON.parse(text);
      res.json(parsed);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Failed to generate" });
    }
  });

  app.post("/api/gemini/summarize", requireAuth, async (req, res) => {
    try {
      const { currentSummary, recentMessages } = req.body;
      const prompt = `Ты летописец RPG игры. Твоя задача - обновить краткое содержание сюжета.
Текущее содержание: ${currentSummary || "Начало приключения."}
Новые события: ${recentMessages}

Напиши обновленное краткое содержание (не более 3-4 абзацев), сохраняя ключевые события и текущую цель героев. Пиши художественно, но емко.`;

      const response = await generateWithFallback(prompt, {
        // Use low thinking for summarization to save time if supported
      });

      res.json({ text: response.text });
    } catch (error) {
      console.error("Summarize error:", error);
      res.status(500).json({ error: "Failed to summarize" });
    }
  });

  app.post("/api/gemini/gm", requireAuth, async (req, res) => {
    try {
      const { playersContext, recentMessages, turn, actionsText } = req.body;
      
      const prompt = `
Ты опытный ИИ Гейм-мастер для многопользовательской текстовой RPG. Твоя цель - реалистично симулировать мир, управлять NPC и реагировать на действия игроков.
ОТВЕЧАЙ СТРОГО НА РУССКОМ ЯЗЫКЕ.

ИГРОКИ В МИРЕ:
${playersContext}

НЕДАВНИЙ КОНТЕКСТ ИСТОРИИ:
${recentMessages}

ТЕКУЩИЙ ХОД: ${turn}
ИГРОКИ ТОЛЬКО ЧТО ОТПРАВИЛИ ЭТИ ДЕЙСТВИЯ:
${actionsText}

ИНСТРУКЦИИ:
1. Проанализируй состояние мира и то, как действия игроков взаимодействуют с ним и друг с другом.
2. Если игроки используют предметы или навыки, проверь, есть ли они у них в инвентаре/навыках.
3. Управляй NPC реалистично. Давай им диалоги и мотивацию.
4. Опиши результат действий и новую ситуацию, в которой оказались игроки.
5. Описывай происходящее ДЕТАЛЬНО, ГЛУБОКО и ХУДОЖЕСТВЕННО. Не ограничивайся поверхностными фактами. Описывай запахи, звуки, эмоции персонажей, атмосферу и мелкие детали окружения. Сделай так, чтобы игроки почувствовали себя внутри живого мира. Заканчивай ход интригой или новым вызовом.
6. Если игрок использует команду /drop, /transfer, /eat, обнови его инвентарь в своем понимании и опиши результат.

ВАЖНО: Если инвентарь, навыки, HP или Мана игроков изменились (например, они получили урон, потратили ману, съели предмет, передали предмет), ИЛИ если нужно добавить статью в Бестиарий (о новом монстре, магии, лоре), добавь в САМЫЙ КОНЕЦ своего ответа блок JSON в строгом формате:
\`\`\`json
{
  "stateUpdates": [
    { "uid": "UID_ИГРОКА", "hp": 20, "mana": 10, "inventory": ["предмет1"], "skills": ["навык1"] }
  ],
  "bestiary": [
    { "title": "Название", "content": "Описание для энциклопедии" }
  ]
}
\`\`\`
`;

      const response = await generateWithFallback(prompt, {
        thinkingConfig: { thinkingLevel: ThinkingLevel.HIGH }
      }, ["gemini-3-flash-preview", "gemini-3.1-pro-preview"]);

      res.json({ text: response.text });
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
