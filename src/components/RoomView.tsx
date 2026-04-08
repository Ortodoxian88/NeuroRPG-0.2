import React, { useEffect, useState, useRef } from 'react';
import { doc, onSnapshot, collection, query, orderBy, setDoc, serverTimestamp, updateDoc, deleteDoc, getDoc } from 'firebase/firestore';
import { db, auth } from '@/src/firebase';
import { Room, Player, Message, AppSettings, ChatSettings } from '@/src/types';
import { Users, Play, Loader2, Backpack, MessageSquare, Sparkles, X, CheckCircle2 } from 'lucide-react';
import { cn } from '@/src/lib/utils';
import { typingIndicators } from '@/src/lib/indicators';
import { processWikiCandidates } from '@/src/services/archivist';

// Subcomponents
import ChatArea from '@/src/components/room/ChatArea';
import ActionInput from '@/src/components/room/ActionInput';
import InventoryTab from '@/src/components/room/InventoryTab';
import StateTab from '@/src/components/room/StateTab';
import QuestTab from '@/src/components/QuestTab';
import DiceOverlay from '@/src/components/room/DiceOverlay';

interface RoomViewProps {
  roomId: string;
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
  { cmd: '/drop', desc: 'Выбросить предмет: /drop [предмет]' },
  { cmd: '/transfer', desc: 'Передать: /transfer [игрок] [предмет]' },
  { cmd: '/eat', desc: 'Съесть/выпить: /eat [предмет]' },
];

export default function RoomView({ roomId, onLeave, onMinimize, onOpenBestiary, appSettings, chatSettings }: RoomViewProps) {
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
  
  const currentUser = auth.currentUser;
  const isHost = Boolean(currentUser && room?.hostId === currentUser.uid);
  const me = players.find(p => p.uid === currentUser?.uid);
  const hasJoined = !!me;
  const isSpectator = !isHost && !me;

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

        const token = await auth.currentUser?.getIdToken();
        const response = await fetch('/api/gemini/summarize', {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
            currentSummary: room.storySummary || "",
            recentMessages,
            roomId
          })
        });

        if (response.ok) {
          const data = await response.json();
          await updateDoc(doc(db, 'rooms', roomId), {
            storySummary: data.text,
            lastSummaryTurn: room.turn
          });
        } else {
          await updateDoc(doc(db, 'rooms', roomId), {
            lastSummaryTurn: room.turn
          });
        }
      } catch (error) {
        console.error("Error summarizing story:", error);
        await updateDoc(doc(db, 'rooms', roomId), {
          lastSummaryTurn: room.turn
        });
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
    try {
      await deleteDoc(doc(db, 'rooms', roomId, 'players', uid));
    } catch (error) {
      console.error("Error kicking player:", error);
    }
  };

  useEffect(() => {
    if (!roomId) return;

    const roomRef = doc(db, 'rooms', roomId);
    const unsubRoom = onSnapshot(roomRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data() as Room;
        setRoom({ id: snapshot.id, ...data });
        
        if (data.currentRoll) {
          const timeDiff = Date.now() - data.currentRoll.timestamp;
          if (timeDiff < 10000) {
            setShowDiceRoll({ player: data.currentRoll.playerName, value: data.currentRoll.value });
            setTimeout(() => setShowDiceRoll(null), 4000);
          }
        }
      } else {
        onLeave();
      }
    });

    const playersRef = collection(db, 'rooms', roomId, 'players');
    const unsubPlayers = onSnapshot(playersRef, (snapshot) => {
      const p: Player[] = [];
      snapshot.forEach(doc => p.push(doc.data() as Player));
      setPlayers(p);
    });

    const messagesQuery = query(collection(db, 'rooms', roomId, 'messages'), orderBy('createdAt', 'asc'));
    const unsubMessages = onSnapshot(messagesQuery, (snapshot) => {
      const m: Message[] = [];
      snapshot.forEach(doc => m.push({ id: doc.id, ...doc.data() } as Message));
      setMessages(m);
    });

    return () => {
      unsubRoom();
      unsubPlayers();
      unsubMessages();
    };
  }, [roomId, onLeave]);

  useEffect(() => {
    if (!isHost || !room || room.status !== 'playing' || room.isGenerating) return;
    if (players.length > 0 && players.every(p => p.isReady)) {
      if (generatingTurnRef.current === room.turn) return;
      generatingTurnRef.current = room.turn;
      generateAIResponse();
    }
  }, [players, isHost, room]);

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser || !characterName.trim() || !characterProfile.trim()) return;
    
    setIsJoining(true);
    try {
      const token = await currentUser.getIdToken();
      const response = await fetch('/api/gemini/join', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ characterName, characterProfile, roomId: (room && room.status === 'playing') ? roomId : undefined })
      });
      
      if (!response.ok) throw new Error('Failed to generate character');
      const parsed = await response.json();

      const playerRef = doc(db, 'rooms', roomId, 'players', currentUser.uid);
      await setDoc(playerRef, {
        uid: currentUser.uid,
        name: characterName.trim(),
        profile: characterProfile.trim(),
        inventory: parsed.inventory || [],
        skills: parsed.skills || [],
        hp: 20,
        maxHp: 20,
        mana: 10,
        maxMana: 10,
        stress: 0,
        alignment: parsed.alignment || 'Нейтральное',
        injuries: [],
        statuses: [],
        mutations: [],
        reputation: {},
        stats: {
          speed: 10,
          reaction: 10,
          strength: 10,
          power: 10,
          durability: 10,
          stamina: 10
        },
        action: '',
        isReady: false,
        joinedAt: serverTimestamp()
      });
      
      localStorage.setItem('lastCharacterName', characterName.trim());
      localStorage.setItem('lastCharacterProfile', characterProfile.trim());
    } catch (error) {
      console.error("Error joining room", error);
    } finally {
      setIsJoining(false);
    }
  };

  const handleStartGame = async () => {
    if (!isHost || !room) return;
    try {
      const msgRef = doc(collection(db, 'rooms', roomId, 'messages'));
      await setDoc(msgRef, {
        role: 'system',
        content: room.scenario,
        turn: 0,
        createdAt: serverTimestamp()
      });
      
      await updateDoc(doc(db, 'rooms', roomId), {
        status: 'playing',
        turn: 1
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
    if (!currentUser || !actionInput.trim() || !me || me.isReady) return;
    
    let input = actionInput.trim();
    let isHidden = false;
    
    if (input.startsWith('/secret ')) {
      isHidden = true;
      input = input.replace('/secret ', '').trim();
    }

    if (input.startsWith('/roll')) {
      const roll = Math.floor(Math.random() * 20) + 1;
      await updateDoc(doc(db, 'rooms', roomId), {
        currentRoll: {
          playerUid: currentUser.uid,
          playerName: me.name,
          value: roll,
          timestamp: Date.now()
        }
      });
      input = `Бросает кубик d20. Результат: **${roll}**`;
    }

    setIsSubmittingAction(true);
    try {
      const playerRef = doc(db, 'rooms', roomId, 'players', currentUser.uid);
      await updateDoc(playerRef, {
        action: input,
        isHiddenAction: isHidden,
        isReady: true
      });
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
    if (!room || room.isGenerating) return;
    
    setGenerationError(null);
    await updateDoc(doc(db, 'rooms', roomId), { isGenerating: true });

    try {
      const token = await auth.currentUser?.getIdToken();
      
      const playersContext = players.map(p => 
        `${p.name} (HP: ${p.hp}/${p.maxHp}, MP: ${p.mana}/${p.maxMana}, Стресс: ${p.stress || 0}/100, Мировоззрение: ${p.alignment || 'Нейтральное'}). Инвентарь: ${p.inventory.join(', ') || 'пусто'}. Навыки: ${p.skills.join(', ') || 'пусто'}. Травмы: ${(p.injuries || []).join(', ') || 'нет'}. Состояния: ${(p.statuses || []).join(', ') || 'нет'}. Мутации: ${(p.mutations || []).join(', ') || 'нет'}. Репутация: ${JSON.stringify(p.reputation || {})}`
      ).join('\n');

      const recentMessages = messages.slice(-15).map(m => 
        `${m.role === 'system' ? 'ГМ' : m.role === 'ai' ? 'ИИ' : m.playerName}: ${m.content}`
      ).join('\n\n');

      const actionsText = players.filter(p => p.isReady).map(p => 
        `${p.name}: ${p.action}${p.isHiddenAction ? ' (ТАЙНО)' : ''}`
      ).join('\n');

      const response = await fetch('/api/gemini/generate', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ 
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
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to generate response');
      }

      const data = await response.json();
      const aiText = data.story;
      
      if (!aiText) {
        throw new Error("ИИ не смог сгенерировать художественный текст. Попробуйте еще раз или проверьте настройки.");
      }

      const reasoning = data.reasoning;
      const stateUpdates = data.stateUpdates;
      const wikiCandidates = data.wikiCandidates;
      const updatedQuests = data.quests;
      const worldUpdates = data.worldUpdates;
      const factionUpdates = data.factionUpdates;
      const hiddenTimersUpdates = data.hiddenTimersUpdates;

      // 1. Add AI message
      const msgRef = doc(collection(db, 'rooms', roomId, 'messages'));
      await setDoc(msgRef, {
        role: 'ai',
        content: aiText,
        reasoning: reasoning || null,
        turn: room.turn,
        createdAt: serverTimestamp()
      });

      // 2. Update player states if AI provided them
      if (stateUpdates && Array.isArray(stateUpdates)) {
        for (const update of stateUpdates) {
          const playerRef = doc(db, 'rooms', roomId, 'players', update.uid);
          const playerSnap = await getDoc(playerRef);
          if (playerSnap.exists()) {
            await updateDoc(playerRef, {
              hp: typeof update.hp === 'number' ? update.hp : playerSnap.data().hp,
              mana: typeof update.mana === 'number' ? update.mana : playerSnap.data().mana,
              stress: typeof update.stress === 'number' ? update.stress : playerSnap.data().stress,
              alignment: typeof update.alignment === 'string' ? update.alignment : playerSnap.data().alignment,
              inventory: Array.isArray(update.inventory) ? update.inventory : playerSnap.data().inventory,
              skills: Array.isArray(update.skills) ? update.skills : playerSnap.data().skills,
              injuries: Array.isArray(update.injuries) ? update.injuries : playerSnap.data().injuries,
              statuses: Array.isArray(update.statuses) ? update.statuses : playerSnap.data().statuses,
              mutations: Array.isArray(update.mutations) ? update.mutations : playerSnap.data().mutations,
              reputation: (typeof update.reputation === 'object' && update.reputation !== null) ? update.reputation : playerSnap.data().reputation,
            });
          }
        }
      }

      // 3. Process Wiki Candidates asynchronously
      if (wikiCandidates && Array.isArray(wikiCandidates) && wikiCandidates.length > 0) {
        // Don't await this, let it run in the background
        processWikiCandidates(wikiCandidates, roomId, currentUser?.uid || 'unknown', setArchivistStatus);
      }

      // 4. Reset player readiness and update room
      for (const p of players) {
        const playerRef = doc(db, 'rooms', roomId, 'players', p.uid);
        await updateDoc(playerRef, {
          isReady: false,
          action: '',
          isHiddenAction: false
        });
      }

      await updateDoc(doc(db, 'rooms', roomId), {
        turn: room.turn + 1,
        isGenerating: false,
        quests: updatedQuests || room.quests || [],
        worldState: worldUpdates || room.worldState || '',
        factions: factionUpdates || room.factions || {},
        hiddenTimers: hiddenTimersUpdates || room.hiddenTimers || {}
      });

    } catch (error: any) {
      console.error("Error generating AI response:", error);
      setGenerationError(error.message || "Произошла ошибка при генерации ответа ИИ.");
      await updateDoc(doc(db, 'rooms', roomId), { isGenerating: false });
    }
  };

  if (!room) {
    return <div className="flex-1 flex items-center justify-center"><Loader2 className="animate-spin text-neutral-500" /></div>;
  }

  if ((!hasJoined && !isHost && room.status === 'lobby') || (isHost && showJoinForm && !hasJoined && room.status === 'lobby')) {
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
            <p className="text-sm text-neutral-400 mt-1">Код комнаты: <span className="font-mono text-white">{roomId}</span></p>
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
          Код комнаты: <span className={cn("font-mono font-bold select-all", appSettings?.theme === 'light' ? "text-neutral-900" : "text-white")}>{roomId}</span>
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
            players={players} 
            isHost={isHost} 
            isSpectator={isSpectator} 
            onExportLog={exportLog} 
            onKickPlayer={kickPlayer} 
            onUpdatePlayer={async (updates) => {
              if (currentUser) {
                await updateDoc(doc(db, 'rooms', roomId, 'players', currentUser.uid), updates);
              }
            }}
            turn={room.turn}
            storySummary={room.storySummary || ''}
            room={room}
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
                    <p className={cn(
                      "text-base",
                      appSettings?.theme === 'light' ? "text-neutral-500" : "text-neutral-400"
                    )}>
                      Код комнаты: <span className={cn(
                        "font-mono px-3 py-1.5 rounded-lg mx-1",
                        appSettings?.theme === 'light' ? "text-neutral-900 bg-neutral-200" : "text-white bg-neutral-800"
                      )}>{roomId}</span>
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
                currentUser={currentUser}
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
        "shrink-0 border-t flex items-center justify-around p-3 pb-safe z-20",
        appSettings?.theme === 'light' ? "bg-white border-neutral-200" : "bg-neutral-900 border-neutral-800"
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
