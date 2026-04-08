import { db } from '../firebase';
import { collection, doc, setDoc, getDocs, query, where, serverTimestamp, updateDoc } from 'firebase/firestore';
import { WikiCandidate } from '../types';

declare const puter: any;

export async function processWikiCandidates(candidates: WikiCandidate[], roomId: string, userId: string, onProgress?: (msg: string) => void) {
  if (!candidates || candidates.length === 0) return;
  if (typeof puter === 'undefined' || !puter.ai) {
    console.warn("Puter.js is not loaded. Skipping wiki generation.");
    return;
  }

  for (const candidate of candidates) {
    try {
      if (onProgress) onProgress(`Архивариус изучает: ${candidate.name}...`);
      
      // Check if entry already exists
      const q = query(collection(db, 'bestiary'), where('roomId', '==', roomId), where('title', '==', candidate.name));
      const snapshot = await getDocs(q);
      const existingEntry = snapshot.empty ? null : snapshot.docs[0];

      const prompt = `Ты - Магистр Элиас, Архивариус и летописец. Тебе принесли сырые факты о сущности/объекте/локации.
Твоя задача - решить, достойно ли это записи в Великую Энциклопедию (Википедию).
Если это банальщина (обычный волк, простой камень, крестьянин), верни JSON: {"rejected": true, "reason": "Слишком банально"}.
Если это достойно, напиши подробную, научную и атмосферную статью.
Не создавай отдельные статьи для каждого подвида (например, разных гоблинов или вариаций одного меча). Если это подвид, обновляй основную статью, добавляя фразу "преобладает разнообразием" и описывая новые виды там.

Имя: ${candidate.name}
Сырые факты: ${candidate.rawFacts}
Причина добавления от разведчиков: ${candidate.reason}
${existingEntry ? `У нас уже есть запись об этом:\n${existingEntry.data().content}\nДОПОЛНИ ЕЁ новыми фактами, если они есть, и повысь уровень знаний.` : 'Это новая запись.'}

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

      const response = await puter.ai.chat(prompt, { model: 'claude-3-5-sonnet', response_format: { type: "json_object" } });
      const text = response.message.content[0].text;
      
      let parsed;
      try {
        parsed = JSON.parse(text);
      } catch (e) {
        const match = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
        if (match) {
          parsed = JSON.parse(match[1]);
        } else {
          throw new Error("Failed to parse JSON from Claude");
        }
      }

      if (parsed.rejected) {
        console.log(`Archivist rejected ${candidate.name}: ${parsed.reason}`);
        continue;
      }

      if (existingEntry) {
        await updateDoc(doc(db, 'bestiary', existingEntry.id), {
          category: parsed.category,
          nature: parsed.nature || 'neutral',
          tags: parsed.tags,
          level: parsed.level,
          content: parsed.content,
          authorNotes: parsed.authorNotes || null,
          updatedAt: serverTimestamp()
        });
      } else {
        const newRef = doc(collection(db, 'bestiary'));
        await setDoc(newRef, {
          title: candidate.name,
          category: parsed.category,
          nature: parsed.nature || 'neutral',
          tags: parsed.tags,
          level: parsed.level,
          content: parsed.content,
          authorNotes: parsed.authorNotes || null,
          roomId: roomId,
          discoveredBy: userId,
          discoveredAt: serverTimestamp(),
          createdAt: serverTimestamp()
        });
      }
    } catch (error) {
      console.error(`Failed to process wiki candidate ${candidate.name}:`, error);
    }
  }
  
  if (onProgress) onProgress('');
}
