import React, { useEffect, useState, useRef } from 'react';
import { supabase } from '@/src/supabase';
import { Room, Player, Message, AppSettings, ChatSettings } from '@/src/types';
import { Users, Play, Loader2, Backpack, MessageSquare, Sparkles, X, CheckCircle2 } from 'lucide-react';
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

interface RoomViewProps {
  roomId: string;
  user: any;
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
];

export default function RoomView({ roomId, user, onLeave, onMinimize, onOpenBestiary, appSettings, chatSettings }: RoomViewProps) {
  const [room, setRoom] = useState<Room | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  
  const [characterName, setCharacterName] = useState(() => localStorage.getItem('lastCharacterName') || '');
  const [characterProfile, setCharacterProfile] = useState(() => localStorage.getItem('lastCharacterProfile') || '');
  const [isJoining, setIsJoining] = useState(false);
  
  const [actionInput, setActionInput] = useState('');
  const [isSubmittingAction, setIsSubmittingAction] = useState(false);
  const [generationError, setGenerationError] = useState<string | null>(null);
  
  const [activeTab, setActiveTab] = useState<Tab>('chat');
  const [archivistStatus, setArchivistStatus] = useState('');
  
  const [showCommands, setShowCommands] = useState(false);
  const [filteredCommands, setFilteredCommands] = useState(COMMANDS);
  const [isRecording, setIsRecording] = useState(false);
  const [showDiceRoll, setShowDiceRoll] = useState<{ player: string, value: number } | null>(null);
  const [typingIndicator, setTypingIndicator] = useState('');
  const [showJoinForm, setShowJoinForm] = useState(false);
  const [typedMessageIds, setTypedMessageIds] = useState<Set<string>>(new Set());
  
  const generatingTurnRef = useRef<number | null>(null);
  const isRequestingRef = useRef(false);
  
  const isHost = Boolean(user && room?.hostId === user.id);
  const me = players.find(p => p.uid === user?.id);
  const hasJoined = !!me;
  const isSpectator = !isHost && !me;

  // Debug logging
  useEffect(() => {
    console.log("[RoomView] State Update:", {
      roomId,
      userId: user?.id,
      hostId: room?.hostId,
      isHost,
      hasJoined,
      playersCount: players.length,
      roomStatus: room?.status,
      showJoinForm,
      me: me?.name
    });
  }, [roomId, user?.id, room?.hostId, isHost, hasJoined, players.length, room?.status, showJoinForm, me]);

  // Vibration effect for new AI messages
  useEffect(() => {
    if (messages.length > 0 && messages[messages.length - 1].role === 'ai' && appSettings?.vibration) {
      try {
        navigator.vibrate?.(50);
      } catch (e) {}
    }
  }, [messages.length, appSettings?.vibration]);

  // Typing indicator logic
  useEffect(() => {
    if (room?.isGenerating) {
      setTypingIndicator(typingIndicators[Math.floor(Math.random() * typingIndicators.length)]);
      const interval = setInterval(() => {
        setTypingIndicator(typingIndicators[Math.floor(Math.random() * typingIndicators.length)]);
      }, 4000);
      return () => clearInterval(interval);
    }
  }, [room?.isGenerating]);

  // Auto-summarization logic
  const isSummarizingRef = useRef(false);
  useEffect(() => {
    const summarizeStory = async () => {
      if (!room || !isHost || room.turn === 0 || room.turn % 5 !== 0 || room.lastSummaryTurn === room.turn || isSummarizingRef.current) return;
      
      isSummarizingRef.current = true;
      try {
        const recentMessages = messages
          .slice(-20)
          .map(m => `${m.role === 'system' ? 'ГМ' : m.role === 'ai' ? 'ИИ' : m.playerName}: ${m.content}`)
          .join('\n\n');

        await api.summarize(roomId, room.storySummary || "", recentMessages);
      } catch (error) {
        console.error("Error summarizing story:", error);
      } finally {
        isSummarizingRef.current = false;
      }
    };

    summarizeStory();
  }, [room?.turn, isHost, roomId, messages, room?.lastSummaryTurn, room?.storySummary]);

  const exportLog = () => {
    const text = messages.map(m => `[Ход ${m.turn}] ${m.role === 'system' ? 'ГМ' : m.role === 'ai' ? 'ИИ' : m.playerName}: ${m.content}`).join('\n\n');
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `NeuroRPG_Log_${roomId}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const kickPlayer = async (uid: string) => {
    if (!isHost || !window.confirm("Вы уверены, что хотите исключить этого игрока?")) return;
    // TODO: Implement kick via API
  };

  useEffect(() => {
    if (!roomId) return;

    let sse: SSEClient | null = null;

    const loadInitialData = async () => {
      try {
        // Setup SSE first to avoid race conditions
        sse = new SSEClient(roomId);
        
        sse.on('message.new', (m: any) => {
          setMessages(prev => {
            if (prev.some(msg => msg.id === m.id)) return prev;
            return [...prev, {
              id: m.id,
              role: m.type === 'system' ? 'system' : m.type === 'ai_response' ? 'ai' : 'player',
              content: m.content,
              reasoning: m.metadata?.reasoning,
              playerName: m.metadata?.playerName,
              playerUid: m.user_id,
              isHidden: m.type === 'secret',
              turn: m.turn_number,
              createdAt: m.created_at
            }];
          });
        });

        sse.on('player.joined', (p: any) => {
          setPlayers(prev => [...prev.filter(existing => existing.uid !== (p.external_user_id || p.user_id)), {
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
            action: p.current_action || '',
            isReady: p.is_ready,
            joinedAt: p.created_at
          }]);
        });

        sse.on('player.updated', (p: any) => {
          setPlayers(prev => prev.map(existing => existing.uid === (p.external_user_id || p.user_id) ? {
            ...existing,
            action: p.current_action || '',
            isReady: p.is_ready,
            hp: p.hp,
            mana: p.mana,
            stress: p.stress,
            inventory: p.inventory || [],
            skills: p.skills || []
          } : existing));
        });

        sse.on('room.updated', (r: any) => {
          setRoom(prev => prev ? {
            ...prev,
            turn: r.turn_number,
            status: r.status,
            quests: r.active_quests || [],
            storySummary: r.story_summary,
            isGenerating: r.turn_status === 'generating'
          } : null);
        });

        await sse.connect();

        // Now fetch initial data
        const [roomData, playersData, messagesData] = await Promise.all([
          api.getRoom(roomId),
          api.getPlayers(roomId),
          api.getMessages(roomId)
        ]);
        
        // Map postgres data to our frontend types
        setRoom(prev => {
          return {
            id: roomData.id,
            joinCode: roomData.join_code,
            hostId: roomData.external_host_id || roomData.host_user_id,
            scenario: roomData.world_settings?.scenario || '',
            turn: roomData.turn_number,
            status: roomData.status,
            quests: roomData.active_quests || [],
            storySummary: roomData.story_summary,
            worldState: roomData.world_settings?.worldState,
            factions: roomData.world_settings?.factions,
            hiddenTimers: roomData.world_settings?.hiddenTimers,
            createdAt: roomData.created_at,
            isGenerating: roomData.turn_status === 'generating'
          };
        });

        setPlayers(prev => {
          const fetchedPlayers = playersData.map((p: any) => ({
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
              stamina: p.stat_charisma
            },
            action: p.current_action || '',
            isReady: p.is_ready,
            joinedAt: p.created_at
          }));
          
          // Merge with any players that might have joined via SSE during fetch
          const merged = [...fetchedPlayers];
          prev.forEach(p => {
            if (!merged.some(mp => mp.uid === p.uid)) {
              merged.push(p);
            }
          });
          return merged;
        });

        setMessages(prev => {
          const fetchedMessages = messagesData.map((m: any) => ({
            id: m.id,
            role: m.type === 'system' ? 'system' : m.type === 'ai_response' ? 'ai' : 'player',
            content: m.content,
            reasoning: m.metadata?.reasoning,
            playerName: m.metadata?.playerName,
            playerUid: m.user_id,
            isHidden: m.type === 'secret',
            turn: m.turn_number,
            createdAt: m.created_at
          }));
          
          const merged = [...fetchedMessages];
          prev.forEach(p => {
            if (!merged.some(m => m.id === p.id)) {
              merged.push(p);
            }
          });
          return merged.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
        });

      } catch (error) {
        console.error("Failed to load room data:", error);
        onLeave();
      }
    };

    loadInitialData();

    return () => {
      if (sse) sse.disconnect();
    };
  }, [roomId, onLeave]);

  useEffect(() => {
    if (!isHost || !room || room.status !== 'playing' || room.isGenerating || isRequestingRef.current) return;
    
    if (players.length > 0 && players.every(p => p.isReady)) {
      // Safety check: don't trigger if we already have an AI message for this turn
      const hasAiResponseForCurrentTurn = messages.some(m => m.turn === room.turn && m.role === 'ai');
      if (hasAiResponseForCurrentTurn) {
        console.log("[RoomView] AI response already exists for turn:", room.turn);
        return;
      }

      if (generatingTurnRef.current === room.turn) return;
      console.log("[RoomView] All players ready, triggering AI generation for turn:", room.turn);
      generateAIResponse();
    }
  }, [players, isHost, room, messages]);

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !characterName.trim() || !characterProfile.trim() || !room) return;
    
    setIsJoining(true);
    try {
      const parsed = await api.generateJoin(characterName, characterProfile, (room && room.status === 'playing') ? roomId : undefined);

      const { player } = await api.joinRoom(room.joinCode, {
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
          stamina: 10
        }
      });
      
      // Update local state immediately for better UX
      setPlayers(prev => {
        const pUid = player.external_user_id || player.user_id;
        if (prev.some(p => p.uid === pUid)) return prev;
        return [...prev, {
          uid: pUid,
          name: player.character_name,
          profile: player.character_profile,
          inventory: player.inventory || [],
          skills: player.skills || [],
          hp: player.hp,
          maxHp: player.hp_max,
          mana: player.mana,
          maxMana: player.mana_max,
          stress: player.stress,
          alignment: player.alignment,
          injuries: player.injuries || [],
          statuses: player.statuses || [],
          mutations: player.mutations || [],
          reputation: player.reputation || {},
          stats: {
            speed: player.stat_dexterity,
            reaction: player.stat_intelligence,
            strength: player.stat_strength,
            power: player.stat_wisdom,
            durability: player.stat_constitution,
            stamina: player.stat_charisma
          },
          action: player.current_action || '',
          isReady: player.is_ready,
          joinedAt: player.created_at
        }];
      });

      localStorage.setItem('lastCharacterName', characterName.trim());
      localStorage.setItem('lastCharacterProfile', characterProfile.trim());
      
      console.log("[RoomView] Join successful:", {
        playerId: player.user_id,
        playerName: player.character_name,
        currentUserId: user?.id
      });
      
      setShowJoinForm(false);
    } catch (error) {
      console.error("Error joining room", error);
      alert("Не удалось присоединиться к комнате. Попробуйте еще раз.");
    } finally {
      setIsJoining(false);
    }
  };

  const handleStartGame = async () => {
    if (!isHost || !room) return;
    try {
      await api.sendMessage(roomId, room.scenario, 'system', 0);
      // Room status will be updated via API or we can add a specific endpoint.
      // For now, let's assume the first message starts the game, but we need to update room status.
      // We should probably add an endpoint for starting the game.
      // Let's just trigger generateAIResponse which will update the turn.
      // Wait, the host starts the game by sending the scenario.
      // Let's add a small fetch to update room status.
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      await fetch(`/api/rooms/${roomId}/start`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
    } catch (error) {
      console.error("Error starting game", error);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setActionInput(val);
    if (val.startsWith('/')) {
      setShowCommands(true);
      const cmdPart = val.split(' ')[0];
      setFilteredCommands(COMMANDS.filter(c => c.cmd.startsWith(cmdPart)));
    } else {
      setShowCommands(false);
    }
  };

  const handleCommandSelect = (cmd: string) => {
    setActionInput(cmd + ' ');
    setShowCommands(false);
  };

  const handleSubmitAction = async (e: React.FormEvent) => {
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
      // We can send a special message or update room via API
      // For now, let's just make it a normal action
      input = `Бросает кубик d20. Результат: **${roll}**`;
    }

    setIsSubmittingAction(true);
    try {
      await api.submitAction(roomId, input, isHidden);
      setActionInput('');
    } catch (error) {
      console.error("Error submitting action", error);
    } finally {
      setIsSubmittingAction(false);
    }
  };

  const handleVoiceInput = () => {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      alert("Ваш браузер не поддерживает распознавание речи.");
      return;
    }

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.lang = 'ru-RU';
    recognition.interimResults = false;

    recognition.onstart = () => setIsRecording(true);
    recognition.onend = () => setIsRecording(false);
    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      setActionInput(prev => prev + transcript);
    };

    recognition.start();
  };

  const generateAIResponse = async () => {
    if (!room || room.isGenerating || isRequestingRef.current) return;
    if (generatingTurnRef.current === room.turn) return;
    
    generatingTurnRef.current = room.turn;
    isRequestingRef.current = true;
    setGenerationError(null);
    
    // Set local state for immediate feedback
    setRoom(prev => prev ? { ...prev, isGenerating: true } : null);

    try {
      const playersContext = players.map(p => 
        `${p.name} (HP: ${p.hp}/${p.maxHp}, MP: ${p.mana}/${p.maxMana}, Стресс: ${p.stress || 0}/100, Мировоззрение: ${p.alignment || 'Нейтральное'}). Инвентарь: ${p.inventory.join(', ') || 'пусто'}. Навыки: ${p.skills.join(', ') || 'пусто'}. Травмы: ${(p.injuries || []).join(', ') || 'нет'}. Состояния: ${(p.statuses || []).join(', ') || 'нет'}. Мутации: ${(p.mutations || []).join(', ') || 'нет'}. Репутация: ${JSON.stringify(p.reputation || {})}`
      ).join('\n');

      const recentMessages = messages.slice(-15).map(m => 
        `${m.role === 'system' ? 'ГМ' : m.role === 'ai' ? 'ИИ' : m.playerName}: ${m.content}`
      ).join('\n\n');

      const actionsText = players.filter(p => p.isReady).map(p => 
        `${p.name}: ${p.action}${p.isHiddenAction ? ' (ТАЙНО)' : ''}`
      ).join('\n');

      const data = await api.generateTurn(roomId, {
        playersContext,
        recentMessages,
        turn: room.turn,
        actionsText,
        currentQuests: room.quests || [],
        worldState: room.worldState,
        factions: room.factions,
        hiddenTimers: room.hiddenTimers,
        gmTone: appSettings?.gmTone || 'classic',
        difficulty: appSettings?.difficulty || 'normal',
        goreLevel: appSettings?.goreLevel || 'medium',
        language: appSettings?.language || 'ru'
      });

      const aiText = data.story;
      
      if (!aiText) {
        throw new Error("ИИ не смог сгенерировать художественный текст. Попробуйте еще раз или проверьте настройки.");
      }

      // The backend should handle saving the message, updating player states, and resetting readiness.
      // We just need to process wiki candidates if they exist.
      const wikiCandidates = data.wikiCandidates;
      if (wikiCandidates && Array.isArray(wikiCandidates) && wikiCandidates.length > 0) {
        // Don't await this, let it run in the background
        processWikiCandidates(wikiCandidates, roomId, user?.id || 'unknown', setArchivistStatus);
      }

    } catch (error: any) {
      console.error("Error generating AI response:", error);
      setGenerationError(error.message || "Произошла ошибка при генерации ответа ИИ.");
      setRoom(prev => prev ? { ...prev, isGenerating: false } : null);
      // Reset ref on error so it can be retried manually if needed, 
      // but the useEffect guard will still prevent immediate auto-retry if turn hasn't changed
    } finally {
      isRequestingRef.current = false;
    }
  };

  if (!room) {
    return <div className="flex-1 flex items-center justify-center"><Loader2 className="animate-spin text-neutral-500" /></div>;
  }

  // Show join form if:
  // 1. User hasn't joined AND (it's lobby OR they explicitly clicked Join)
  // 2. EXCEPT if they are the host and haven't clicked Join yet (they see the lobby first)
  const shouldShowJoinForm = !hasJoined && (
    (!isHost && room.status === 'lobby') || 
    (isHost && showJoinForm) ||
    (room.status === 'playing' && !isHost) // Force join if game started and not joined
  );

  if (shouldShowJoinForm) {
    return (
      <div className="flex-1 flex flex-col p-4 overflow-y-auto pb-20">
        <div className="w-full bg-neutral-900 border border-neutral-800 rounded-xl p-6 space-y-6 relative">
          {isHost && (
            <button 
              onClick={() => setShowJoinForm(false)}
              className="absolute top-4 right-4 text-neutral-500 hover:text-white"
            >
              <X size={20} />
            </button>
          )}
          <div>
            <h2 className="text-xl font-semibold text-white font-display">Создание персонажа</h2>
            <p className="text-sm text-neutral-400 mt-1">Код комнаты: <span className="font-mono text-white">{room.joinCode}</span></p>
          </div>
          
          <form onSubmit={handleJoin} className="space-y-5">
            <div className="space-y-2">
              <label className="block text-base font-medium text-neutral-300">Имя персонажа</label>
              <input
                type="text"
                value={characterName}
                onChange={(e) => setCharacterName(e.target.value)}
                className="w-full bg-black border border-neutral-800 rounded-2xl p-4 text-base text-neutral-100 focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500 outline-none"
                placeholder="Например: Элара Шедоубоу"
                required
              />
            </div>
            <div className="space-y-2">
              <label className="block text-base font-medium text-neutral-300">Анкета персонажа</label>
              <p className="text-sm text-neutral-500 mb-2">Опишите вашу расу, класс, предысторию и то, что у вас с собой. ИИ проанализирует это и создаст ваш стартовый инвентарь и навыки.</p>
              <textarea
                value={characterProfile}
                onChange={(e) => setCharacterProfile(e.target.value)}
                rows={6}
                className="w-full bg-black border border-neutral-800 rounded-2xl p-4 text-base text-neutral-100 focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500 outline-none resize-none"
                placeholder="Например: Ловкий эльф-разбойник, выросший в трущобах. Я ношу с собой пару ржавых кинжалов, отмычки и загадочную серебряную монету."
                required
              />
            </div>
            <button
              type="submit"
              disabled={isJoining || !characterName.trim() || !characterProfile.trim()}
              className="w-full bg-orange-600 hover:bg-orange-500 text-white font-bold py-4 px-4 rounded-2xl transition-all disabled:opacity-50 flex items-center justify-center gap-2 text-base active:scale-95 shadow-xl shadow-orange-600/20"
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

  return (
    <div className={cn(
      "flex-1 flex flex-col relative overflow-hidden",
      appSettings?.theme === 'light' ? "bg-neutral-50" : "bg-black"
    )}>
      
      <DiceOverlay showDiceRoll={showDiceRoll} />
      
      {archivistStatus && (
        <div className="absolute top-4 right-4 z-50 bg-neutral-900/90 text-orange-400 px-4 py-2 rounded-full text-sm font-medium flex items-center gap-2 shadow-lg border border-orange-500/30 animate-pulse">
          <Sparkles size={16} />
          {archivistStatus}
        </div>
      )}

      {/* Room Code Header */}
      <div className={cn(
        "px-4 py-2 flex justify-between items-center border-b text-xs",
        appSettings?.theme === 'light' ? "bg-white border-neutral-200" : "bg-neutral-900/50 border-neutral-800"
      )}>
        <span className={cn("font-medium", appSettings?.theme === 'light' ? "text-neutral-500" : "text-neutral-400")}>
          Код комнаты: <span className={cn("font-mono font-bold select-all", appSettings?.theme === 'light' ? "text-neutral-900" : "text-white")}>{room.joinCode}</span>
        </span>
        {appSettings?.localMusicUrl && (
          <audio src={appSettings.localMusicUrl} autoPlay loop controls className="h-6 w-48 opacity-50 hover:opacity-100 transition-opacity" />
        )}
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
        {activeTab === 'inventory' && (
          <InventoryTab me={me} isSpectator={isSpectator} appSettings={appSettings} />
        )}

        {activeTab === 'state' && (
          <StateTab 
            me={me} 
            appSettings={appSettings}
          />
        )}

        {activeTab === 'quests' && (
          <QuestTab quests={room.quests || []} appSettings={appSettings} />
        )}

        {activeTab === 'chat' && (
          <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
            {room.status === 'lobby' ? (
              <div className="flex-1 overflow-y-auto p-4">
                <div className="flex flex-col items-center justify-center py-12 text-center space-y-8">
                  <div className={cn(
                    "w-20 h-20 rounded-full flex items-center justify-center border",
                    appSettings?.theme === 'light' ? "bg-white border-neutral-200" : "bg-neutral-900 border-neutral-800"
                  )}>
                    <Users size={40} className="text-neutral-500" />
                  </div>
                  <div>
                    <h2 className={cn(
                      "text-2xl font-bold mb-3 font-display",
                      appSettings?.theme === 'light' ? "text-neutral-900" : "text-white"
                    )}>Ожидание в лобби</h2>
                    {hasJoined && (
                      <div className="bg-green-500/10 border border-green-500/20 text-green-500 text-sm py-2 px-4 rounded-xl mb-4 inline-block animate-in fade-in slide-in-from-top-2">
                        Вы успешно присоединились! Дождитесь начала игры.
                      </div>
                    )}
                    <p className={cn(
                      "text-base",
                      appSettings?.theme === 'light' ? "text-neutral-500" : "text-neutral-400"
                    )}>
                      Код комнаты: <span className={cn(
                        "font-mono px-3 py-1.5 rounded-lg mx-1",
                        appSettings?.theme === 'light' ? "text-neutral-900 bg-neutral-200" : "text-white bg-neutral-800"
                      )}>{room.joinCode}</span>
                    </p>
                  </div>
                  
                  <div className={cn(
                    "w-full max-w-sm border rounded-2xl p-6 text-left",
                    appSettings?.theme === 'light' ? "bg-white border-neutral-200 shadow-sm" : "bg-neutral-900 border-neutral-800"
                  )}>
                    <h3 className={cn(
                      "text-base font-medium mb-4",
                      appSettings?.theme === 'light' ? "text-neutral-600" : "text-neutral-300"
                    )}>В комнате ({players.length + (players.some(p => p.uid === room.hostId) ? 0 : 1)})</h3>
                    <div className="space-y-4">
                      {!players.some(p => p.uid === room.hostId) && (
                        <div className="flex items-center justify-between text-base">
                          <div className="flex items-center gap-3 text-neutral-400">
                            <div className="w-2 h-2 rounded-full bg-blue-500" />
                            <span className={appSettings?.theme === 'light' ? "text-neutral-700" : "text-neutral-200"}>Гейм-мастер (Хост)</span>
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
                      {players.map(p => (
                        <div key={p.uid} className="flex items-center gap-3 text-base text-neutral-400">
                          <div className="w-2 h-2 rounded-full bg-orange-500" />
                          <span className={appSettings?.theme === 'light' ? "text-neutral-700" : "text-neutral-200"}>{p.name} {p.uid === room.hostId ? '(Хост)' : ''}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {isHost && (
                    <button
                      onClick={handleStartGame}
                      disabled={players.length === 0}
                      className="w-full max-w-sm bg-orange-600 hover:bg-orange-500 text-white font-bold py-4 px-4 rounded-2xl flex items-center justify-center gap-2 transition-colors disabled:opacity-50 text-lg shadow-xl shadow-orange-600/20"
                    >
                      <Play size={24} />
                      Начать игру
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <ChatArea 
                messages={messages}
                currentUser={user}
                isGenerating={room.isGenerating || false}
                typingIndicator={typingIndicator}
                generationError={generationError}
                isHost={isHost}
                onRetryGeneration={() => { generatingTurnRef.current = null; generateAIResponse(); }}
                onForceTurn={() => { generatingTurnRef.current = room.turn; generateAIResponse(); }}
                playersCount={players.length}
                readyPlayersCount={players.filter(p => p.isReady).length}
                players={players}
                typedMessageIds={typedMessageIds}
                onMessageTyped={(id) => setTypedMessageIds(prev => new Set(prev).add(id))}
                chatSettings={chatSettings}
                appSettings={appSettings}
              />
            )}
          </div>
        )}
      </div>

      {/* Input Area (Only visible in Chat tab when playing) */}
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

      {/* Bottom Navigation */}
      <div className={cn(
        "shrink-0 border-t flex items-center justify-around p-3 pb-safe z-20 shadow-[0_-4px_20px_rgba(0,0,0,0.25)]",
        appSettings?.theme === 'light' ? "bg-white/95 border-neutral-200" : "bg-neutral-900/95 border-neutral-800"
      )}>
        <button
          onClick={() => setActiveTab('inventory')}
          className={cn(
            "flex flex-col items-center justify-center p-2 w-20 rounded-xl transition-colors",
            activeTab === 'inventory' ? "text-orange-500" : "text-neutral-500 hover:text-neutral-300"
          )}
        >
          <Backpack size={24} className="mb-1.5" />
          <span className="text-xs font-medium">Инвентарь</span>
        </button>
        
        <button
          onClick={() => setActiveTab('chat')}
          className={cn(
            "flex flex-col items-center justify-center p-2 w-20 rounded-xl transition-colors",
            activeTab === 'chat' ? "text-orange-500" : "text-neutral-500 hover:text-neutral-300"
          )}
        >
          <MessageSquare size={24} className="mb-1.5" />
          <span className="text-xs font-medium">Чат</span>
        </button>

        <button
          onClick={() => setActiveTab('quests')}
          className={cn(
            "flex flex-col items-center justify-center p-2 w-20 rounded-xl transition-colors",
            activeTab === 'quests' ? "text-orange-500" : "text-neutral-500 hover:text-neutral-300"
          )}
        >
          <Sparkles size={24} className="mb-1.5" />
          <span className="text-xs font-medium">Квесты</span>
        </button>
        
        <button
          onClick={() => setActiveTab('state')}
          className={cn(
            "flex flex-col items-center justify-center p-2 w-20 rounded-xl transition-colors",
            activeTab === 'state' ? "text-orange-500" : "text-neutral-500 hover:text-neutral-300"
          )}
        >
          <Users size={24} className="mb-1.5" />
          <span className="text-xs font-medium">Мир</span>
        </button>
      </div>
    </div>
  );
}
