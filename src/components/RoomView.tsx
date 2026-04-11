// src/views/RoomView.tsx

import React, {
  useEffect,
  useState,
  useRef,
  useCallback,
  useMemo,
} from 'react';
import { supabase } from '@/src/supabase';
import {
  Room,
  Player,
  Message,
  AppSettings,
  ChatSettings,
} from '@/src/types';
import {
  Users,
  Play,
  Loader2,
  Backpack,
  MessageSquare,
  Sparkles,
  X,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import { cn } from '@/src/lib/utils';
import { typingIndicators } from '@/src/lib/indicators';
import { processWikiCandidates } from '@/src/services/archivist';
import { api } from '@/src/services/api';
import { SSEClient } from '@/src/services/sse';

// Subcomponents
import ChatArea from '@/src/components/room/ChatArea';
import { ActionInput } from '@/src/components/room/ActionInput';
import { InventoryTab } from '@/src/components/room/InventoryTab';
import { StateTab } from '@/src/components/room/StateTab';
import QuestTab from '@/src/components/QuestTab';
import { DiceOverlay } from '@/src/components/room/DiceOverlay';

// ─────────────────────────────────────────────
// Типы
// ─────────────────────────────────────────────

/**
 * Тип авторизованного пользователя Supabase.
 * Заменяем `any` на конкретную структуру.
 */
interface AuthUser {
  id: string;
  email?: string;
}

interface RoomViewProps {
  roomId: string;
  user: AuthUser;
  onLeave: () => void;
  onMinimize: () => void;
  onOpenBestiary: () => void;
  appSettings?: AppSettings;
  chatSettings?: ChatSettings;
}

type Tab = 'inventory' | 'chat' | 'state' | 'quests';

const COMMANDS = [
  { cmd: '/roll', desc: 'Бросить кубик d20' },
  { cmd: '/secret', desc: 'Тайное действие: /secret [действие]' },
] as const;

/**
 * Максимальное количество ID сообщений в typedMessageIds.
 * Старые удаляются чтобы Set не рос бесконечно.
 */
const MAX_TYPED_IDS = 200;

/**
 * Флаг режима разработки — убирает console.log в продакшене.
 */
const isDev = import.meta.env.DEV;

// ─────────────────────────────────────────────
// Мапперы данных (единственное место маппинга)
// ─────────────────────────────────────────────

/**
 * Преобразует сырые данные игрока из PostgreSQL в тип Player.
 * Единственное место где происходит этот маппинг — DRY.
 * Было 3 копии этого кода: в loadInitialData, sse.on и handleJoin.
 */
function mapRawPlayer(p: any): Player {
  return {
    uid: p.external_user_id || p.user_id,
    name: p.character_name,
    profile: p.character_profile,
    inventory: p.inventory || [],
    skills: p.skills || [],
    hp: p.hp,
    maxHp: p.hp_max,
    mana: p.mana,
    maxMana: p.mana_max,
    stress: p.stress,
    alignment: p.alignment,
    injuries: p.injuries || [],
    statuses: p.statuses || [],
    mutations: p.mutations || [],
    reputation: p.reputation || {},
    stats: {
      speed: p.stat_dexterity,
      reaction: p.stat_intelligence,
      strength: p.stat_strength,
      power: p.stat_wisdom,
      durability: p.stat_constitution,
      stamina: p.stat_charisma,
    },
    action: p.current_action || '',
    isReady: p.is_ready,
    joinedAt: p.created_at,
  };
}

/**
 * Преобразует сырые данные сообщения из PostgreSQL в тип Message.
 */
function mapRawMessage(m: any): Message {
  return {
    id: m.id,
    role:
      m.type === 'system'
        ? 'system'
        : m.type === 'ai_response'
        ? 'ai'
        : 'player',
    content: m.content,
    reasoning: m.metadata?.reasoning,
    playerName: m.metadata?.playerName,
    playerUid: m.user_id,
    isHidden: m.type === 'secret',
    turn: m.turn_number,
    createdAt: m.created_at,
  };
}

/**
 * Преобразует сырые данные комнаты из PostgreSQL в тип Room.
 */
function mapRawRoom(r: any): Room {
  return {
    id: r.id,
    joinCode: r.join_code,
    hostId: r.external_host_id || r.host_user_id,
    scenario: r.world_settings?.scenario || '',
    turn: r.turn_number,
    status: r.status,
    quests: r.active_quests || [],
    storySummary: r.story_summary,
    worldState: r.world_settings?.worldState,
    factions: r.world_settings?.factions,
    hiddenTimers: r.world_settings?.hiddenTimers,
    createdAt: r.created_at,
    isGenerating: r.turn_status === 'generating',
  };
}

/**
 * Мержит два массива игроков/сообщений по uid/id.
 * Приоритет у items из `incoming` (более свежие данные из fetch).
 * SSE-данные из `existing` добавляются только если их нет в `incoming`.
 */
function mergeById<T extends { uid?: string; id?: string }>(
  incoming: T[],
  existing: T[],
  key: 'uid' | 'id'
): T[] {
  const result = [...incoming];
  existing.forEach((item) => {
    if (!result.some((r) => r[key] === item[key])) {
      result.push(item);
    }
  });
  return result;
}

// ─────────────────────────────────────────────
// Вспомогательные компоненты
// ─────────────────────────────────────────────

/**
 * Инлайн-ошибка — заменяет alert().
 */
function InlineError({
  message,
  onDismiss,
}: {
  message: string;
  onDismiss: () => void;
}) {
  return (
    <div
      className="flex items-center gap-3 p-4 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-500"
      role="alert"
    >
      <AlertCircle size={20} className="shrink-0" />
      <p className="text-sm flex-1">{message}</p>
      <button
        onClick={onDismiss}
        className="text-red-500/70 hover:text-red-500 transition-colors"
        aria-label="Закрыть ошибку"
      >
        <X size={16} />
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────
// Хук для записи голоса
// ─────────────────────────────────────────────

/**
 * Изолирует логику SpeechRecognition.
 * Хранит recognition в ref — корректно останавливает при анмаунте.
 */
function useVoiceInput(onTranscript: (text: string) => void) {
  const recognitionRef = useRef<any>(null);
  const [isRecording, setIsRecording] = useState(false);

  // Останавливаем при анмаунте компонента
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.abort();
        recognitionRef.current = null;
      }
    };
  }, []);

  const startRecording = useCallback(() => {
    const SpeechRecognition =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      // Не используем alert — возвращаем ошибку
      return false;
    }

    const recognition = new SpeechRecognition();
    recognitionRef.current = recognition;
    recognition.lang = 'ru-RU';
    recognition.interimResults = false;

    recognition.onstart = () => setIsRecording(true);
    recognition.onend = () => {
      setIsRecording(false);
      recognitionRef.current = null;
    };
    recognition.onerror = () => {
      setIsRecording(false);
      recognitionRef.current = null;
    };
    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      onTranscript(transcript);
    };

    recognition.start();
    return true;
  }, [onTranscript]);

  return { isRecording, startRecording };
}

// ─────────────────────────────────────────────
// Главный компонент
// ─────────────────────────────────────────────

export default function RoomView({
  roomId,
  user,
  onLeave,
  onMinimize,
  onOpenBestiary,
  appSettings,
  chatSettings,
}: RoomViewProps) {
  const isLight = appSettings?.theme === 'light';

  // ── State ──────────────────────────────────
  const [room, setRoom] = useState<Room | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);

  const [characterName, setCharacterName] = useState(
    () => localStorage.getItem('lastCharacterName') || ''
  );
  const [characterProfile, setCharacterProfile] = useState(
    () => localStorage.getItem('lastCharacterProfile') || ''
  );
  const [isJoining, setIsJoining] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);

  const [actionInput, setActionInput] = useState('');
  const [isSubmittingAction, setIsSubmittingAction] = useState(false);
  const [generationError, setGenerationError] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<Tab>('chat');
  const [archivistStatus, setArchivistStatus] = useState('');

  const [showCommands, setShowCommands] = useState(false);
  const [filteredCommands, setFilteredCommands] = useState<typeof COMMANDS[number][]>([...COMMANDS]);
  const [showDiceRoll, setShowDiceRoll] = useState<{
    player: string;
    value: number;
  } | null>(null);
  const [typingIndicator, setTypingIndicator] = useState('');
  const [showJoinForm, setShowJoinForm] = useState(false);

  /**
   * Set хранит ID сообщений которые уже "напечатаны" анимацией.
   * Ограничен MAX_TYPED_IDS чтобы не расти бесконечно.
   */
  const [typedMessageIds, setTypedMessageIds] = useState<Set<string>>(
    new Set()
  );

  // ── Refs ───────────────────────────────────

  /**
   * Хранит номер хода для которого уже запущена генерация.
   * Защищает от двойного запуска generateAIResponse.
   */
  const generatingTurnRef = useRef<number | null>(null);

  /**
   * Ref для флага суммаризации — не тригерит ре-рендер.
   */
  const isSummarizingRef = useRef(false);

  /**
   * Ref для актуального room — решает проблему stale closure
   * в generateAIResponse и useEffect для AI-генерации.
   */
  const roomRef = useRef<Room | null>(null);
  useEffect(() => {
    roomRef.current = room;
  }, [room]);

  /**
   * Ref для актуального players — аналогично.
   */
  const playersRef = useRef<Player[]>([]);
  useEffect(() => {
    playersRef.current = players;
  }, [players]);

  /**
   * Ref для актуального messages — для generateAIResponse.
   */
  const messagesRef = useRef<Message[]>([]);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  // ── Производные значения ───────────────────

  const isHost = Boolean(user && room?.hostId === user.id);
  const me = useMemo(
    () => players.find((p) => p.uid === user?.id),
    [players, user?.id]
  );
  const hasJoined = !!me;
  const isSpectator = !isHost && !me;

  // ── Вибрация при новом AI-сообщении ───────
  useEffect(() => {
    if (messages.length === 0) return;
    const lastMessage = messages[messages.length - 1];
    if (lastMessage.role === 'ai' && appSettings?.vibration) {
      try {
        navigator.vibrate?.(50);
      } catch (_e) {
        // Вибрация недоступна — молча игнорируем
      }
    }
  }, [messages.length, appSettings?.vibration]);

  // ── Индикатор печати ───────────────────────
  useEffect(() => {
    if (!room?.isGenerating) return;

    // Устанавливаем сразу при старте генерации
    setTypingIndicator(
      typingIndicators[Math.floor(Math.random() * typingIndicators.length)]
    );

    const interval = setInterval(() => {
      // Исключаем повторение: фильтруем текущий индикатор
      setTypingIndicator((prev) => {
        const options = typingIndicators.filter((t) => t !== prev);
        return options[Math.floor(Math.random() * options.length)];
      });
    }, 4000);

    return () => clearInterval(interval);
  }, [room?.isGenerating]);

  // ── Голосовой ввод ─────────────────────────
  const { isRecording, startRecording } = useVoiceInput((transcript) => {
    setActionInput((prev) => prev + transcript);
  });

  const handleVoiceInput = useCallback(() => {
    const started = startRecording();
    if (!started) {
      setJoinError('Ваш браузер не поддерживает распознавание речи.');
    }
  }, [startRecording]);

  // ── Загрузка данных + SSE ──────────────────
  useEffect(() => {
    if (!roomId) return;

    let sse: SSEClient | null = null;
    // Флаг для защиты от setState после анмаунта
    let isMounted = true;

    const loadInitialData = async () => {
      try {
        // Сначала подключаем SSE чтобы не пропустить события
        // которые придут пока грузятся начальные данные
        sse = new SSEClient(roomId);

        sse.on('message.new', (m: any) => {
          if (!isMounted) return;
          setMessages((prev) => {
            if (prev.some((msg) => msg.id === m.id)) return prev;
            return [...prev, mapRawMessage(m)];
          });
        });

        sse.on('player.joined', (p: any) => {
          if (!isMounted) return;
          const mapped = mapRawPlayer(p);
          setPlayers((prev) => [
            ...prev.filter((existing) => existing.uid !== mapped.uid),
            mapped,
          ]);
        });

        sse.on('player.updated', (p: any) => {
          if (!isMounted) return;
          const uid = p.external_user_id || p.user_id;
          setPlayers((prev) =>
            prev.map((existing) =>
              existing.uid === uid
                ? {
                    ...existing,
                    action: p.current_action || '',
                    isReady: p.is_ready,
                    hp: p.hp,
                    mana: p.mana,
                    stress: p.stress,
                    inventory: p.inventory || [],
                    skills: p.skills || [],
                  }
                : existing
            )
          );
        });

        sse.on('room.updated', (r: any) => {
          if (!isMounted) return;
          setRoom((prev) =>
            prev
              ? {
                  ...prev,
                  turn: r.turn_number,
                  status: r.status,
                  quests: r.active_quests || [],
                  storySummary: r.story_summary,
                  isGenerating: r.turn_status === 'generating',
                }
              : null
          );
        });

        await sse.connect();

        // Загружаем начальные данные параллельно
        const [roomData, playersData, messagesData] = await Promise.all([
          api.getRoom(roomId),
          api.getPlayers(roomId),
          api.getMessages(roomId),
        ]);

        if (!isMounted) return;

        // Применяем начальные данные, мержим с тем что пришло через SSE
        setRoom(mapRawRoom(roomData));

        setPlayers((prev) => {
          const fetched = playersData.map(mapRawPlayer);
          // mergeById: fetched имеет приоритет, SSE-данные добавляются если их нет
          return mergeById(fetched, prev, 'uid');
        });

        setMessages((prev) => {
          const fetched = messagesData.map(mapRawMessage);
          const merged = mergeById(fetched, prev, 'id');
          // Сортируем по времени создания
          return merged.sort(
            (a, b) =>
              new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
          );
        });
      } catch (error) {
        if (!isMounted) return;
        console.error('[RoomView] Ошибка загрузки данных комнаты:', error);
        onLeave();
      }
    };

    loadInitialData();

    return () => {
      isMounted = false;
      if (sse) sse.disconnect();
    };
  }, [roomId, onLeave]);

  // ── Auto-суммаризация ──────────────────────
  useEffect(() => {
    const currentRoom = roomRef.current;
    const currentMessages = messagesRef.current;

    if (
      !currentRoom ||
      !isHost ||
      currentRoom.turn === 0 ||
      currentRoom.turn % 5 !== 0 ||
      currentRoom.lastSummaryTurn === currentRoom.turn ||
      isSummarizingRef.current
    )
      return;

    isSummarizingRef.current = true;

    const recentMessages = currentMessages
      .slice(-20)
      .map(
        (m) =>
          `${m.role === 'system' ? 'ГМ' : m.role === 'ai' ? 'ИИ' : m.playerName}: ${m.content}`
      )
      .join('\n\n');

    api
      .summarize(roomId, currentRoom.storySummary || '', recentMessages)
      .catch((error) => {
        console.error('[RoomView] Ошибка суммаризации:', error);
      })
      .finally(() => {
        isSummarizingRef.current = false;
      });

    // Зависимость только от turn — refs дают доступ к актуальным данным
    // без добавления room/messages в deps (избегаем лишних запусков)
  }, [room?.turn, isHost, roomId]);

  // ── Генерация AI ───────────────────────────

  /**
   * Основная функция генерации AI-ответа.
   * useCallback с пустыми deps — читает актуальные данные через refs.
   * Это решает проблему stale closure и бесконечного цикла.
   *
   * ВАЖНО: Промпт формируется на СЕРВЕРЕ по roomId.
   * Клиент передаёт только настройки (тон, сложность и т.д.)
   * чтобы избежать prompt injection.
   */
  const generateAIResponse = useCallback(async () => {
    const currentRoom = roomRef.current;
    if (!currentRoom || currentRoom.isGenerating) return;

    setGenerationError(null);
    setRoom((prev) => (prev ? { ...prev, isGenerating: true } : null));

    try {
      const data = await api.generateTurn(roomId, {
        // Сервер сам читает контекст из БД по roomId
        // Клиент передаёт только пользовательские настройки
        gmTone: appSettings?.gmTone || 'classic',
        difficulty: appSettings?.difficulty || 'normal',
        goreLevel: appSettings?.goreLevel || 'medium',
        language: appSettings?.language || 'ru',
      });

      if (!data.story) {
        throw new Error(
          'ИИ не смог сгенерировать текст. Попробуйте ещё раз.'
        );
      }

      // Обработка wiki-кандидатов в фоне (не блокируем UI)
      if (Array.isArray(data.wikiCandidates) && data.wikiCandidates.length > 0) {
        processWikiCandidates(
          data.wikiCandidates,
          roomId,
          user.id,
          setArchivistStatus
        );
      }
    } catch (error: any) {
      console.error('[RoomView] Ошибка генерации AI:', error);
      setGenerationError(
        error.message || 'Произошла ошибка при генерации ответа ИИ.'
      );
      // Сбрасываем флаг генерации чтобы можно было повторить
      setRoom((prev) => (prev ? { ...prev, isGenerating: false } : null));
    }
  }, [roomId, appSettings, user.id]);

  /**
   * Триггер автоматической генерации AI.
   * Использует refs вместо прямых зависимостей от room/players
   * чтобы избежать бесконечного цикла:
   * generateAIResponse → setRoom → room изменился → useEffect → generateAIResponse
   */
  useEffect(() => {
    const currentRoom = roomRef.current;
    const currentPlayers = playersRef.current;

    if (
      !isHost ||
      !currentRoom ||
      currentRoom.status !== 'playing' ||
      currentRoom.isGenerating ||
      currentPlayers.length === 0
    )
      return;

    const allReady = currentPlayers.every((p) => p.isReady);
    if (!allReady) return;

    // Защита от повторного запуска на том же ходу
    if (generatingTurnRef.current === currentRoom.turn) return;
    generatingTurnRef.current = currentRoom.turn;

    generateAIResponse();

    // players и room в deps через refs — этот effect зависит только
    // от изменений players (isReady) и статуса хоста
  }, [players, isHost, generateAIResponse]);

  // ── Экспорт лога ───────────────────────────
  const exportLog = useCallback(() => {
    const text = messages
      .map(
        (m) =>
          `[Ход ${m.turn}] ${
            m.role === 'system' ? 'ГМ' : m.role === 'ai' ? 'ИИ' : m.playerName
          }: ${m.content}`
      )
      .join('\n\n');

    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `NeuroRPG_Log_${roomId}.txt`;
    a.click();

    // Освобождаем URL сразу после клика
    URL.revokeObjectURL(url);
  }, [messages, roomId]);

  // ── Кик игрока ─────────────────────────────
  const kickPlayer = useCallback(
    async (uid: string) => {
      if (!isHost) return;
      if (!window.confirm('Вы уверены, что хотите исключить этого игрока?'))
        return;
      try {
        await api.kickPlayer(roomId, uid);
      } catch (error) {
        console.error('[RoomView] Ошибка кика игрока:', error);
      }
    },
    [isHost, roomId]
  );

  // ── Начало игры ────────────────────────────
  const handleStartGame = useCallback(async () => {
    const currentRoom = roomRef.current;
    if (!isHost || !currentRoom) return;

    try {
      // Используем api.ts — не делаем голый fetch с токеном
      await api.startRoom(roomId);
    } catch (error) {
      console.error('[RoomView] Ошибка старта игры:', error);
      setGenerationError('Не удалось начать игру. Попробуйте ещё раз.');
    }
  }, [isHost, roomId]);

  // ── Присоединение к комнате ────────────────
  const handleJoin = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const currentRoom = roomRef.current;

      if (!user || !characterName.trim() || !characterProfile.trim() || !currentRoom)
        return;

      setIsJoining(true);
      setJoinError(null);

      try {
        const parsed = await api.generateJoin(
          characterName,
          characterProfile,
          currentRoom.status === 'playing' ? roomId : undefined
        );

        const { player } = await api.joinRoom(currentRoom.joinCode, {
          characterName: characterName.trim(),
          characterProfile: characterProfile.trim(),
          inventory: parsed.inventory || [],
          skills: parsed.skills || [],
          alignment: parsed.alignment || 'Нейтральное',
          stats: {
            speed: 10,
            reaction: 10,
            strength: 10,
            power: 10,
            durability: 10,
            stamina: 10,
          },
        });

        // Оптимистичное обновление UI — не ждём SSE
        setPlayers((prev) => {
          const mapped = mapRawPlayer(player);
          if (prev.some((p) => p.uid === mapped.uid)) return prev;
          return [...prev, mapped];
        });

        localStorage.setItem('lastCharacterName', characterName.trim());
        localStorage.setItem('lastCharacterProfile', characterProfile.trim());

        if (isDev) {
          console.log('[RoomView] Join успешен:', {
            playerId: player.user_id,
            playerName: player.character_name,
          });
        }

        setShowJoinForm(false);
      } catch (error: any) {
        console.error('[RoomView] Ошибка присоединения:', error);
        // Заменяем alert() на inline ошибку
        setJoinError(
          error.message || 'Не удалось присоединиться. Попробуйте ещё раз.'
        );
      } finally {
        setIsJoining(false);
      }
    },
    [user, characterName, characterProfile, roomId]
  );

  // ── Ввод действия ──────────────────────────
  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = e.target.value;
      setActionInput(val);

      if (val.startsWith('/')) {
        setShowCommands(true);
        const cmdPart = val.split(' ')[0];
        setFilteredCommands(
          COMMANDS.filter((c) => c.cmd.startsWith(cmdPart))
        );
      } else {
        setShowCommands(false);
      }
    },
    []
  );

  const handleCommandSelect = useCallback((cmd: string) => {
    setActionInput(cmd + ' ');
    setShowCommands(false);
  }, []);

  const handleSubmitAction = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!user || !actionInput.trim() || !me || me.isReady) return;

      let input = actionInput.trim();
      let isHidden = false;

      if (input.startsWith('/secret ')) {
        isHidden = true;
        input = input.replace('/secret ', '').trim();
      }

      if (input.startsWith('/roll')) {
        const roll = Math.floor(Math.random() * 20) + 1;
        // Показываем оверлей с кубиком
        setShowDiceRoll({ player: me.name, value: roll });
        setTimeout(() => setShowDiceRoll(null), 3000);
        input = `Бросает кубик d20. Результат: **${roll}**`;
      }

      setIsSubmittingAction(true);
      try {
        await api.submitAction(roomId, input, isHidden);
        setActionInput('');
      } catch (error) {
        console.error('[RoomView] Ошибка отправки действия:', error);
      } finally {
        setIsSubmittingAction(false);
      }
    },
    [user, actionInput, me, roomId]
  );

  // ── Добавление ID в typedMessageIds ────────
  const handleMessageTyped = useCallback((id: string) => {
    setTypedMessageIds((prev) => {
      const next = new Set(prev);
      next.add(id);

      // Чистим старые ID если Set переполнен
      if (next.size > MAX_TYPED_IDS) {
        const iterator = next.values();
        // Удаляем самый старый (первый добавленный)
        next.delete(iterator.next().value);
      }

      return next;
    });
  }, []);

  // ── Определение нужна ли форма вступления ──

  /**
   * Логика показа формы создания персонажа.
   *
   * Показываем если:
   * 1. Не присоединились (нет в списке players)
   * 2. И выполняется одно из условий:
   *    a. Не хост + лобби (обычный игрок ждёт)
   *    b. Хост явно нажал "Присоединиться"
   *    c. Игра уже идёт + не хост (опоздавший игрок)
   *
   * Спектатор (!isHost && !hasJoined) не получает форму если
   * он явно не попадает в эти условия — но по условию (c)
   * спектатор во время игры всё равно получит форму.
   * Если нужно разделить спектаторов и опоздавших — добавить
   * отдельный флаг `isSpectatorMode` в стейт.
   */
  const shouldShowJoinForm =
    !hasJoined &&
    ((!isHost && room?.status === 'lobby') ||
      (isHost && showJoinForm) ||
      (room?.status === 'playing' && !isHost));

  // ── Лоадер пока комната не загружена ──────
  if (!room) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="animate-spin text-neutral-500" size={32} />
      </div>
    );
  }

  // ── Форма создания персонажа ───────────────
  if (shouldShowJoinForm) {
    return (
      <div className="flex-1 flex flex-col p-4 overflow-y-auto pb-20">
        <div
          className={cn(
            'w-full border rounded-xl p-6 space-y-6 relative',
            isLight
              ? 'bg-white border-neutral-200'
              : 'bg-neutral-900 border-neutral-800'
          )}
        >
          {/* Кнопка закрытия для хоста */}
          {isHost && (
            <button
              onClick={() => setShowJoinForm(false)}
              className="absolute top-4 right-4 text-neutral-500 hover:text-white transition-colors"
              aria-label="Закрыть форму"
            >
              <X size={20} />
            </button>
          )}

          <div>
            <h2
              className={cn(
                'text-xl font-semibold font-display',
                isLight ? 'text-neutral-900' : 'text-white'
              )}
            >
              Создание персонажа
            </h2>
            <p className="text-sm text-neutral-400 mt-1">
              Код комнаты:{' '}
              <span className="font-mono text-white">{room.joinCode}</span>
            </p>
          </div>

          {/* Инлайн-ошибка вместо alert() */}
          {joinError && (
            <InlineError
              message={joinError}
              onDismiss={() => setJoinError(null)}
            />
          )}

          <form onSubmit={handleJoin} className="space-y-5">
            <div className="space-y-2">
              <label
                htmlFor="character-name"
                className={cn(
                  'block text-base font-medium',
                  isLight ? 'text-neutral-700' : 'text-neutral-300'
                )}
              >
                Имя персонажа
              </label>
              <input
                id="character-name"
                type="text"
                value={characterName}
                onChange={(e) => setCharacterName(e.target.value)}
                className={cn(
                  'w-full border rounded-2xl p-4 text-base',
                  'focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500 outline-none',
                  isLight
                    ? 'bg-neutral-50 border-neutral-200 text-neutral-900'
                    : 'bg-black border-neutral-800 text-neutral-100'
                )}
                placeholder="Например: Элара Шедоубоу"
                required
                maxLength={50}
              />
            </div>

            <div className="space-y-2">
              <label
                htmlFor="character-profile"
                className={cn(
                  'block text-base font-medium',
                  isLight ? 'text-neutral-700' : 'text-neutral-300'
                )}
              >
                Анкета персонажа
              </label>
              <p className="text-sm text-neutral-500">
                Опишите вашу расу, класс, предысторию и то, что у вас с собой.
                ИИ проанализирует это и создаст стартовый инвентарь и навыки.
              </p>
              <textarea
                id="character-profile"
                value={characterProfile}
                onChange={(e) => setCharacterProfile(e.target.value)}
                rows={6}
                className={cn(
                  'w-full border rounded-2xl p-4 text-base',
                  'focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500 outline-none resize-none',
                  isLight
                    ? 'bg-neutral-50 border-neutral-200 text-neutral-900'
                    : 'bg-black border-neutral-800 text-neutral-100'
                )}
                placeholder="Например: Ловкий эльф-разбойник, выросший в трущобах..."
                required
                maxLength={2000}
              />
            </div>

            <button
              type="submit"
              disabled={
                isJoining ||
                !characterName.trim() ||
                !characterProfile.trim()
              }
              className={cn(
                'w-full bg-orange-600 hover:bg-orange-500 text-white',
                'font-bold py-4 px-4 rounded-2xl transition-all',
                'disabled:opacity-50 flex items-center justify-center gap-2',
                'text-base active:scale-95 shadow-xl shadow-orange-600/20',
                'focus:outline-none focus:ring-2 focus:ring-orange-500'
              )}
            >
              {isJoining ? (
                <>
                  <Loader2 size={24} className="animate-spin" />
                  <span>Создание персонажа...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 size={24} />
                  <span>Создать персонажа</span>
                </>
              )}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // ── Основной игровой экран ─────────────────
  return (
    <div
      className={cn(
        'flex-1 flex flex-col relative overflow-hidden',
        isLight ? 'bg-neutral-50' : 'bg-black'
      )}
    >
      <DiceOverlay showDiceRoll={showDiceRoll} />

      {/* Статус Архивариуса (фоновая обработка wiki) */}
      {archivistStatus && (
        <div className="absolute top-4 right-4 z-50 bg-neutral-900/90 text-orange-400 px-4 py-2 rounded-full text-sm font-medium flex items-center gap-2 shadow-lg border border-orange-500/30 animate-pulse">
          <Sparkles size={16} aria-hidden="true" />
          {archivistStatus}
        </div>
      )}

      {/* Шапка с кодом комнаты */}
      <div
        className={cn(
          'px-4 py-2 flex justify-between items-center border-b text-xs',
          isLight
            ? 'bg-white border-neutral-200'
            : 'bg-neutral-900/50 border-neutral-800'
        )}
      >
        <span
          className={cn(
            'font-medium',
            isLight ? 'text-neutral-500' : 'text-neutral-400'
          )}
        >
          Код комнаты:{' '}
          <span
            className={cn(
              'font-mono font-bold select-all',
              isLight ? 'text-neutral-900' : 'text-white'
            )}
          >
            {room.joinCode}
          </span>
        </span>

        {/* Аудиоплеер для локальной музыки */}
        {appSettings?.localMusicUrl && (
          <audio
            src={appSettings.localMusicUrl}
            autoPlay
            loop
            controls
            className="h-6 w-48 opacity-50 hover:opacity-100 transition-opacity"
            aria-label="Фоновая музыка"
          />
        )}
      </div>

      {/* Ошибка генерации (глобальная) */}
      {generationError && (
        <div className="px-4 pt-2">
          <InlineError
            message={generationError}
            onDismiss={() => setGenerationError(null)}
          />
        </div>
      )}

      {/* Основная область контента */}
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
        {activeTab === 'inventory' && (
          <InventoryTab
            me={me}
            isSpectator={isSpectator}
            appSettings={appSettings}
          />
        )}

        {activeTab === 'state' && (
          <StateTab me={me} appSettings={appSettings} />
        )}

        {activeTab === 'quests' && (
          <QuestTab quests={room.quests || []} appSettings={appSettings} />
        )}

        {activeTab === 'chat' && (
          <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
            {room.status === 'lobby' ? (
              /* ── Лобби ── */
              <div className="flex-1 overflow-y-auto p-4">
                <div className="flex flex-col items-center justify-center py-12 text-center space-y-8">
                  <div
                    className={cn(
                      'w-20 h-20 rounded-full flex items-center justify-center border',
                      isLight
                        ? 'bg-white border-neutral-200'
                        : 'bg-neutral-900 border-neutral-800'
                    )}
                  >
                    <Users
                      size={40}
                      className="text-neutral-500"
                      aria-hidden="true"
                    />
                  </div>

                  <div>
                    <h2
                      className={cn(
                        'text-2xl font-bold mb-3 font-display',
                        isLight ? 'text-neutral-900' : 'text-white'
                      )}
                    >
                      Ожидание в лобби
                    </h2>

                    {hasJoined && (
                      <div className="bg-green-500/10 border border-green-500/20 text-green-500 text-sm py-2 px-4 rounded-xl mb-4 inline-block">
                        Вы успешно присоединились! Дождитесь начала игры.
                      </div>
                    )}

                    <p
                      className={cn(
                        'text-base',
                        isLight ? 'text-neutral-500' : 'text-neutral-400'
                      )}
                    >
                      Код комнаты:{' '}
                      <span
                        className={cn(
                          'font-mono px-3 py-1.5 rounded-lg mx-1',
                          isLight
                            ? 'text-neutral-900 bg-neutral-200'
                            : 'text-white bg-neutral-800'
                        )}
                      >
                        {room.joinCode}
                      </span>
                    </p>
                  </div>

                  {/* Список игроков в лобби */}
                  <div
                    className={cn(
                      'w-full max-w-sm border rounded-2xl p-6 text-left',
                      isLight
                        ? 'bg-white border-neutral-200 shadow-sm'
                        : 'bg-neutral-900 border-neutral-800'
                    )}
                  >
                    <h3
                      className={cn(
                        'text-base font-medium mb-4',
                        isLight ? 'text-neutral-600' : 'text-neutral-300'
                      )}
                    >
                      В комнате (
                      {players.length +
                        (players.some((p) => p.uid === room.hostId) ? 0 : 1)}
                      )
                    </h3>

                    <div className="space-y-4">
                      {/* Хост если не в списке players */}
                      {!players.some((p) => p.uid === room.hostId) && (
                        <div className="flex items-center justify-between text-base">
                          <div className="flex items-center gap-3 text-neutral-400">
                            <div className="w-2 h-2 rounded-full bg-blue-500" />
                            <span
                              className={
                                isLight
                                  ? 'text-neutral-700'
                                  : 'text-neutral-200'
                              }
                            >
                              Гейм-мастер (Хост)
                            </span>
                          </div>
                          {isHost && !hasJoined && (
                            <button
                              onClick={() => setShowJoinForm(true)}
                              className="text-xs bg-orange-600 hover:bg-orange-500 px-3 py-1.5 rounded-lg text-white transition-colors shadow-lg shadow-orange-600/20"
                            >
                              Присоединиться
                            </button>
                          )}
                        </div>
                      )}

                      {/* Список присоединившихся игроков */}
                      {players.map((p) => (
                        <div
                          key={p.uid}
                          className="flex items-center justify-between text-base text-neutral-400"
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-2 h-2 rounded-full bg-orange-500" />
                            <span
                              className={
                                isLight
                                  ? 'text-neutral-700'
                                  : 'text-neutral-200'
                              }
                            >
                              {p.name}{' '}
                              {p.uid === room.hostId ? '(Хост)' : ''}
                            </span>
                          </div>

                          {/* Кнопка кика — только для хоста, не себя */}
                          {isHost && p.uid !== user.id && (
                            <button
                              onClick={() => kickPlayer(p.uid)}
                              className="text-xs text-red-500/60 hover:text-red-500 transition-colors px-2 py-1 rounded"
                              aria-label={`Исключить ${p.name}`}
                            >
                              Кик
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Кнопка старта игры */}
                  {isHost && (
                    <button
                      onClick={handleStartGame}
                      disabled={players.length === 0}
                      className={cn(
                        'w-full max-w-sm bg-orange-600 hover:bg-orange-500',
                        'text-white font-bold py-4 px-4 rounded-2xl',
                        'flex items-center justify-center gap-2 transition-colors',
                        'disabled:opacity-50 text-lg shadow-xl shadow-orange-600/20',
                        'focus:outline-none focus:ring-2 focus:ring-orange-500'
                      )}
                    >
                      <Play size={24} aria-hidden="true" />
                      Начать игру
                    </button>
                  )}
                </div>
              </div>
            ) : (
              /* ── Игровой чат ── */
              <ChatArea
                messages={messages}
                currentUser={user}
                isGenerating={room.isGenerating || false}
                typingIndicator={typingIndicator}
                generationError={generationError}
                isHost={isHost}
                onRetryGeneration={() => {
                  generatingTurnRef.current = null;
                  generateAIResponse();
                }}
                onForceTurn={() => {
                  generatingTurnRef.current = room.turn;
                  generateAIResponse();
                }}
                playersCount={players.length}
                readyPlayersCount={players.filter((p) => p.isReady).length}
                players={players}
                typedMessageIds={typedMessageIds}
                onMessageTyped={handleMessageTyped}
                chatSettings={chatSettings}
                appSettings={appSettings}
              />
            )}
          </div>
        )}
      </div>

      {/* Поле ввода действия — только в чате во время игры */}
      {activeTab === 'chat' && room.status === 'playing' && (
        <ActionInput
          me={me}
          isSpectator={isSpectator}
          isGenerating={room.isGenerating || false}
          actionInput={actionInput}
          isSubmittingAction={isSubmittingAction}
          showCommands={showCommands}
          filteredCommands={filteredCommands}
          isRecording={isRecording}
          onInputChange={handleInputChange}
          onCommandSelect={handleCommandSelect}
          onSubmit={handleSubmitAction}
          onVoiceInput={handleVoiceInput}
          appSettings={appSettings}
        />
      )}

      {/* Нижняя навигация */}
      <nav
        className={cn(
          'shrink-0 border-t flex items-center justify-around p-3',
          '[padding-bottom:max(0.75rem,env(safe-area-inset-bottom))]',
          'z-20 shadow-[0_-4px_20px_rgba(0,0,0,0.25)]',
          isLight
            ? 'bg-white/95 border-neutral-200'
            : 'bg-neutral-900/95 border-neutral-800'
        )}
        aria-label="Навигация по разделам"
      >
        {(
          [
            { tab: 'inventory', icon: Backpack, label: 'Инвентарь' },
            { tab: 'chat', icon: MessageSquare, label: 'Чат' },
            { tab: 'quests', icon: Sparkles, label: 'Квесты' },
            { tab: 'state', icon: Users, label: 'Мир' },
          ] as const
        ).map(({ tab, icon: Icon, label }) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={cn(
              'flex flex-col items-center justify-center p-2 w-20 rounded-xl transition-colors',
              'focus:outline-none focus:ring-2 focus:ring-orange-500',
              activeTab === tab
                ? 'text-orange-500'
                : isLight
                ? 'text-neutral-400 hover:text-neutral-700'
                : 'text-neutral-500 hover:text-neutral-300'
            )}
            aria-label={label}
            aria-pressed={activeTab === tab}
          >
            <Icon size={24} className="mb-1.5" aria-hidden="true" />
            <span className="text-xs font-medium">{label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}

RoomView.displayName = 'RoomView';