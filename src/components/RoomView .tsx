import React, { useEffect, useState, useRef } from 'react';
import { doc, onSnapshot, collection, query, orderBy, setDoc, serverTimestamp, updateDoc, deleteDoc } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { Room, Player, Message } from '../types';
import { Send, Users, Play, Loader2, Backpack, MessageSquare, Sparkles, Mic, Dices, X, Download, UserMinus } from 'lucide-react';
import { cn } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import Markdown from 'react-markdown';
import { typingIndicators } from '../lib/indicators';

interface RoomViewProps {
  roomId: string;
  onLeave: () => void;
  onOpenBestiary: () => void;
}

type Tab = 'inventory' | 'chat' | 'state';

const COMMANDS = [
  { cmd: '/roll', desc: 'Бросить кубик d20' },
  { cmd: '/secret', desc: 'Тайное действие: /secret [действие]' },
  { cmd: '/drop', desc: 'Выбросить предмет: /drop [предмет]' },
  { cmd: '/transfer', desc: 'Передать: /transfer [игрок] [предмет]' },
  { cmd: '/eat', desc: 'Съесть/выпить: /eat [предмет]' },
];

export default function RoomView({ roomId, onLeave, onOpenBestiary }: RoomViewProps) {
  const [room, setRoom] = useState<Room | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  
  const [characterName, setCharacterName] = useState('');
  const [characterProfile, setCharacterProfile] = useState('');
  const [isJoining, setIsJoining] = useState(false);
  
  const [actionInput, setActionInput] = useState('');
  const [isSubmittingAction, setIsSubmittingAction] = useState(false);
  const [generationError, setGenerationError] = useState<string | null>(null);
  
  const [activeTab, setActiveTab] = useState<Tab>('chat');
  
  const [showCommands, setShowCommands] = useState(false);
  const [filteredCommands, setFilteredCommands] = useState(COMMANDS);
  const [isRecording, setIsRecording] = useState(false);
  const [showDiceRoll, setShowDiceRoll] = useState<{ player: string, value: number } | null>(null);
  const [typingIndicator, setTypingIndicator] = useState('');
  const [showJoinForm, setShowJoinForm] = useState(false);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const generatingTurnRef = useRef<number | null>(null);
  
  const currentUser = auth.currentUser;
  const isHost = Boolean(currentUser && room?.hostId === currentUser.uid);
  const me = players.find(p => p.uid === currentUser?.uid);
  const hasJoined = !!me;
  const isSpectator = !isHost && !me;

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
            recentMessages
          })
        });

        if (response.ok) {
          const data = await response.json();
          await updateDoc(doc(db, 'rooms', roomId), {
            storySummary: data.text,
            lastSummaryTurn: room.turn
          });
        } else {
          // Mark as summarized even on failure to prevent infinite retries
          await updateDoc(doc(db, 'rooms', roomId), {
            lastSummaryTurn: room.turn
          });
        }
      } catch (error) {
        console.error("Error summarizing story:", error);
        // Mark as summarized even on failure to prevent infinite retries
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
      alert("Не удалось исключить игрока.");
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
    let prevMessageCount = 0;
    const unsubMessages = onSnapshot(messagesQuery, (snapshot) => {
      const m: Message[] = [];
      snapshot.forEach(doc => m.push({ id: doc.id, ...doc.data() } as Message));
      setMessages(m);
      
      // Only scroll to bottom if a new message was added
      if (m.length > prevMessageCount) {
        setTimeout(() => {
          messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        }, 100);
      }
      prevMessageCount = m.length;
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
        body: JSON.stringify({ characterName, characterProfile })
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
        action: '',
        isReady: false,
        joinedAt: serverTimestamp()
      });

      if (room && room.status === 'playing') {
        const msgRef = doc(collection(db, 'rooms', roomId, 'messages'));
        await setDoc(msgRef, {
          role: 'system',
          content: `Игрок **${characterName.trim()}** присоединился к игре!`,
          turn: room.turn,
          createdAt: serverTimestamp()
        });
      }
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
    } else if (input === '/secret') {
      return;
    }
    
    if (input === '/roll') {
      await updateDoc(doc(db, 'rooms', roomId), {
        currentRoll: {
          playerUid: currentUser.uid,
          playerName: me.name,
          value: Math.floor(Math.random() * 20) + 1,
          timestamp: Date.now()
        }
      });
      setActionInput('');
      setShowCommands(false);
      return;
    }
    
    setIsSubmittingAction(true);
    try {
      const msgRef = doc(collection(db, 'rooms', roomId, 'messages'));
      await setDoc(msgRef, {
        role: 'player',
        playerUid: currentUser.uid,
        playerName: me.name,
        content: input,
        isHidden: isHidden,
        turn: room.turn,
        createdAt: serverTimestamp()
      });

      const playerRef = doc(db, 'rooms', roomId, 'players', currentUser.uid);
      await updateDoc(playerRef, {
        action: input,
        isHiddenAction: isHidden,
        isReady: true
      });
      setActionInput('');
      setShowCommands(false);
    } catch (error) {
      console.error("Error submitting action", error);
    } finally {
      setIsSubmittingAction(false);
    }
  };

  const handleVoiceInput = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("Голосовой ввод не поддерживается в вашем браузере.");
      return;
    }
    
    const recognition = new SpeechRecognition();
    recognition.lang = 'ru-RU';
    recognition.interimResults = false;
    
    recognition.onstart = () => setIsRecording(true);
    recognition.onend = () => setIsRecording(false);
    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      setActionInput(prev => prev + (prev ? ' ' : '') + transcript);
    };
    
    recognition.start();
  };

  const generateAIResponse = async () => {
    if (!room) return;
    
    try {
      setGenerationError(null);
      await updateDoc(doc(db, 'rooms', roomId), { isGenerating: true });
      
      const actionsText = players.map(p => {
        const actionStr = p.action || 'бездействует';
        return p.isHiddenAction ? `${p.name} (ТАЙНО): ${actionStr}` : `${p.name}: ${actionStr}`;
      }).join('\n');
      
      const recentMessages = messages
        .filter(m => !(m.turn === room.turn && m.role === 'player'))
        .slice(-15)
        .map(m => {
          if (m.role === 'system') return `Гейм-мастер (Система): ${m.content}`;
          if (m.role === 'ai') return `Гейм-мастер (ИИ): ${m.content}`;
          if (m.role === 'player') {
            return m.isHidden ? `${m.playerName} (ТАЙНО): ${m.content}` : `${m.playerName}: ${m.content}`;
          }
          return `Действия игроков:\n${m.content}`;
        }).join('\n\n');

      const playersContext = players.map(p => 
        `- ${p.name} (UID: ${p.uid})\n  HP: ${p.hp}/${p.maxHp}, Mana: ${p.mana}/${p.maxMana}\n  Анкета: ${p.profile}\n  Инвентарь: ${p.inventory.join(', ')}\n  Навыки: ${p.skills.join(', ')}`
      ).join('\n\n');

      const token = await auth.currentUser?.getIdToken();
      const response = await fetch('/api/gemini/gm', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          playersContext,
          recentMessages,
          turn: room.turn,
          actionsText
        })
      });

      if (!response.ok) throw new Error('Failed to generate GM response');
      const data = await response.json();

      let aiText = data.text || "Гейм-мастер молчит...";
      
      // Parse JSON block if exists
      let jsonString = null;
      let textToRemove = '';
      
      const markdownMatch = aiText.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
      if (markdownMatch) {
        jsonString = markdownMatch[1];
        textToRemove = markdownMatch[0];
      } else {
        // Fallback: try to find a raw JSON object at the end of the text
        const rawJsonMatch = aiText.match(/(\{\s*(?:"stateUpdates"|"bestiary")[\s\S]*\})\s*$/i);
        if (rawJsonMatch) {
          jsonString = rawJsonMatch[1];
          textToRemove = rawJsonMatch[0];
        }
      }

      if (jsonString) {
        try {
          const parsed = JSON.parse(jsonString);
          aiText = aiText.replace(textToRemove, '').trim();
          
          if (parsed.stateUpdates && Array.isArray(parsed.stateUpdates)) {
            for (const update of parsed.stateUpdates) {
              if (update.uid) {
                const pRef = doc(db, 'rooms', roomId, 'players', update.uid);
                await updateDoc(pRef, {
                  hp: update.hp ?? 20,
                  mana: update.mana ?? 10,
                  inventory: update.inventory ?? [],
                  skills: update.skills ?? []
                });
              }
            }
          }
          
          if (parsed.bestiary && Array.isArray(parsed.bestiary)) {
            for (const entry of parsed.bestiary) {
              if (entry.title && entry.content) {
                await setDoc(doc(collection(db, 'bestiary')), {
                  title: entry.title,
                  content: entry.content,
                  discoveredAt: serverTimestamp(),
                  discoveredBy: currentUser?.uid || 'unknown'
                });
              }
            }
          }
        } catch (e) {
          console.error("Failed to parse AI JSON block", e);
        }
      }

      const aiMsgRef = doc(collection(db, 'rooms', roomId, 'messages'));
      await setDoc(aiMsgRef, {
        role: 'ai',
        content: aiText,
        turn: room.turn,
        createdAt: serverTimestamp()
      });

      const nextTurn = room.turn + 1;
      
      const updatePromises = players.map(p => 
        updateDoc(doc(db, 'rooms', roomId, 'players', p.uid), {
          action: '',
          isHiddenAction: false,
          isReady: false
        })
      );
      await Promise.all(updatePromises);
      
      await updateDoc(doc(db, 'rooms', roomId), {
        turn: nextTurn,
        isGenerating: false
      });

    } catch (error) {
      console.error("Error generating AI response", error);
      // DO NOT reset generatingTurnRef here, otherwise useEffect will trigger an infinite loop
      setGenerationError("Ошибка при генерации ответа. Попробуйте еще раз.");
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
          
          <form onSubmit={handleJoin} className="space-y-4">
            <div className="space-y-2">
              <label className="block text-sm font-medium text-neutral-300">Имя персонажа</label>
              <input
                type="text"
                value={characterName}
                onChange={(e) => setCharacterName(e.target.value)}
                className="w-full bg-black border border-neutral-800 rounded-lg p-3 text-neutral-100 focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500 outline-none"
                placeholder="Например: Элара Шедоубоу"
                required
              />
            </div>
            <div className="space-y-2">
              <label className="block text-sm font-medium text-neutral-300">Анкета персонажа</label>
              <p className="text-xs text-neutral-500 mb-2">Опишите вашу расу, класс, предысторию и то, что у вас с собой. ИИ проанализирует это и создаст ваш стартовый инвентарь и навыки.</p>
              <textarea
                value={characterProfile}
                onChange={(e) => setCharacterProfile(e.target.value)}
                rows={6}
                className="w-full bg-black border border-neutral-800 rounded-lg p-3 text-neutral-100 focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500 outline-none resize-none"
                placeholder="Например: Ловкий эльф-разбойник, выросший в трущобах. Я ношу с собой пару ржавых кинжалов, отмычки и загадочную серебряную монету."
                required
              />
            </div>
            <button
              type="submit"
              disabled={isJoining || !characterName.trim() || !characterProfile.trim()}
              className="w-full bg-orange-600 hover:bg-orange-500 text-white font-medium py-3 px-4 rounded-lg transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isJoining ? (
                <>
                  <Loader2 size={18} className="animate-spin" />
                  ИИ анализирует персонажа...
                </>
              ) : 'Присоединиться'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col relative bg-black">
      
      {/* Dice Roll Overlay */}
      <AnimatePresence>
        {showDiceRoll && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-50 bg-black/80 backdrop-blur-sm flex flex-col items-center justify-center"
          >
            <motion.div
              initial={{ scale: 0.5, rotate: -180 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: "spring", damping: 12, stiffness: 100 }}
              className="w-32 h-32 bg-orange-600 rounded-2xl flex items-center justify-center shadow-2xl shadow-orange-600/50 mb-6 relative overflow-hidden"
            >
              <div className="absolute inset-0 bg-gradient-to-br from-white/20 to-transparent" />
              <span className="text-6xl font-bold text-white drop-shadow-md z-10">{showDiceRoll.value}</span>
            </motion.div>
            <motion.div
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.3 }}
              className="text-center"
            >
              <h3 className="text-2xl font-bold text-white mb-1 font-display">{showDiceRoll.player}</h3>
              <p className="text-orange-400 text-lg">бросает кубик (d20)</p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
        {activeTab === 'inventory' && (
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            <h2 className="text-xl font-bold text-white flex items-center gap-2 mb-6 font-display">
              <Backpack className="text-orange-500" /> Инвентарь
            </h2>
            {isSpectator ? (
              <p className="text-neutral-500 text-center py-8">Вы наблюдатель. У вас нет инвентаря.</p>
            ) : me?.inventory.length === 0 ? (
              <p className="text-neutral-500 text-center py-8">Ваши карманы пусты.</p>
            ) : (
              <ul className="space-y-2">
                {me?.inventory.map((item, i) => (
                  <li key={i} className="bg-neutral-900 border border-neutral-800 p-3 rounded-lg text-neutral-200 flex items-center gap-3">
                    <div className="w-2 h-2 rounded-full bg-orange-500/50" />
                    {item}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {activeTab === 'state' && (
          <div className="flex-1 overflow-y-auto p-4 space-y-6">
            <h2 className="text-xl font-bold text-white flex items-center justify-between mb-2 font-display">
              <div className="flex items-center gap-2">
                <Sparkles className="text-orange-500" /> Состояние
              </div>
              {isHost && (
                <button onClick={exportLog} className="text-xs flex items-center gap-1 bg-neutral-800 hover:bg-neutral-700 px-2 py-1 rounded transition-colors text-neutral-300">
                  <Download size={14} /> Экспорт лога
                </button>
              )}
            </h2>
            
            {isSpectator ? (
              <div className="space-y-4">
                <p className="text-neutral-500 text-sm mb-4">Вы наблюдатель. Состояние игроков:</p>
                {players.map(p => (
                  <div key={p.uid} className="bg-neutral-900 border border-neutral-800 rounded-xl p-4 space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="font-bold text-white">{p.name}</span>
                      <span className="text-xs text-neutral-400">HP: {p.hp}/{p.maxHp} | MP: {p.mana}/{p.maxMana}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <>
                <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4 space-y-4">
                  <div className="space-y-1">
                    <div className="flex justify-between text-sm">
                      <span className="text-red-400 font-medium">Здоровье (HP)</span>
                      <span className="text-neutral-300">{me?.hp} / {me?.maxHp}</span>
                    </div>
                    <div className="h-2 bg-neutral-800 rounded-full overflow-hidden">
                      <div className="h-full bg-red-500 transition-all" style={{ width: `${Math.max(0, Math.min(100, ((me?.hp || 0) / (me?.maxHp || 1)) * 100))}%` }} />
                    </div>
                  </div>
                  
                  <div className="space-y-1">
                    <div className="flex justify-between text-sm">
                      <span className="text-blue-400 font-medium">Мана (MP)</span>
                      <span className="text-neutral-300">{me?.mana} / {me?.maxMana}</span>
                    </div>
                    <div className="h-2 bg-neutral-800 rounded-full overflow-hidden">
                      <div className="h-full bg-blue-500 transition-all" style={{ width: `${Math.max(0, Math.min(100, ((me?.mana || 0) / (me?.maxMana || 1)) * 100))}%` }} />
                    </div>
                  </div>
                </div>

                <div>
                  <h3 className="text-sm font-medium text-neutral-400 mb-3 uppercase tracking-wider">Навыки</h3>
                  {me?.skills.length === 0 ? (
                    <p className="text-neutral-500 text-sm">У вас нет особых навыков.</p>
                  ) : (
                    <ul className="space-y-2">
                      {me?.skills.map((skill, i) => (
                        <li key={i} className="bg-neutral-900 border border-neutral-800 p-3 rounded-lg text-neutral-200 flex items-center gap-3 text-sm">
                          <div className="w-1.5 h-1.5 rounded-full bg-orange-500/50" />
                          {skill}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </>
            )}
            
            {/* Host Panel */}
            {isHost && (
              <div className="mt-8 pt-6 border-t border-neutral-800">
                <h3 className="text-sm font-medium text-neutral-400 mb-3 uppercase tracking-wider">Управление игроками</h3>
                <div className="space-y-2">
                  {players.map(p => (
                    <div key={p.uid} className="flex items-center justify-between bg-neutral-900 p-3 rounded-lg border border-neutral-800">
                      <span className="text-sm text-neutral-200">{p.name}</span>
                      <button 
                        onClick={() => kickPlayer(p.uid)}
                        className="text-red-500 hover:text-red-400 p-1 bg-red-500/10 rounded transition-colors"
                        title="Исключить игрока"
                      >
                        <UserMinus size={16} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'chat' && (
          <div className="flex-1 overflow-y-auto p-4 space-y-6">
            {room.status === 'lobby' ? (
              <div className="flex flex-col items-center justify-center py-12 text-center space-y-6">
                <div className="w-16 h-16 bg-neutral-900 rounded-full flex items-center justify-center border border-neutral-800">
                  <Users size={32} className="text-neutral-500" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-white mb-2 font-display">Ожидание в лобби</h2>
                  <p className="text-neutral-400 text-sm">
                    Код комнаты: <span className="font-mono text-white bg-neutral-800 px-2 py-1 rounded mx-1">{roomId}</span>
                  </p>
                </div>
                
                <div className="w-full max-w-sm bg-neutral-900 border border-neutral-800 rounded-lg p-4 text-left">
                  <h3 className="text-sm font-medium text-neutral-300 mb-3">В комнате ({players.length + (players.some(p => p.uid === room.hostId) ? 0 : 1)})</h3>
                  <div className="space-y-2">
                    {!players.some(p => p.uid === room.hostId) && (
                      <div className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2 text-neutral-400">
                          <div className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                          <span className="text-neutral-200">Гейм-мастер (Хост)</span>
                        </div>
                        {isHost && !hasJoined && (
                           <button 
                             onClick={() => setShowJoinForm(true)}
                             className="text-[10px] bg-orange-600 hover:bg-orange-500 px-2 py-0.5 rounded text-white transition-colors"
                           >
                             Присоединиться как игрок
                           </button>
                        )}
                      </div>
                    )}
                    {players.map(p => (
                      <div key={p.uid} className="flex items-center gap-2 text-sm text-neutral-400">
                        <div className="w-1.5 h-1.5 rounded-full bg-orange-500" />
                        <span className="text-neutral-200">{p.name} {p.uid === room.hostId ? '(Хост)' : ''}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {isHost && (
                  <button
                    onClick={handleStartGame}
                    disabled={players.length === 0}
                    className="w-full max-w-sm bg-orange-600 hover:bg-orange-500 text-white font-medium py-3 px-4 rounded-lg flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
                  >
                    <Play size={18} />
                    Начать игру
                  </button>
                )}
              </div>
            ) : (
              <>
                {messages.map(msg => {
                  if (msg.role === 'player') {
                    const isMine = msg.playerUid === currentUser?.uid;
                    
                    if (msg.isHidden && !isMine) {
                      return (
                        <div key={msg.id} className="rounded-xl p-3 text-sm bg-neutral-900/30 border border-neutral-800/30 text-neutral-500 italic flex items-center gap-2">
                          <span>🔒</span>
                          <span>{msg.playerName} сделал тайное действие</span>
                        </div>
                      );
                    }
                    return (
                      <div key={msg.id} className={cn(
                        "rounded-xl p-4 text-sm",
                        isMine ? "bg-orange-900/20 border border-orange-900/30 text-orange-100" : "bg-neutral-800/50 border border-neutral-700/50 text-neutral-200",
                        msg.isHidden && "border-red-500/30 bg-red-900/20"
                      )}>
                        <div className="text-xs font-semibold uppercase tracking-wider mb-2 flex items-center gap-2 text-neutral-400">
                          {msg.playerName} 
                          {msg.isHidden && <span className="text-red-400 font-bold bg-red-500/10 px-2 py-0.5 rounded flex items-center gap-1">🔒 ТАЙНОЕ ДЕЙСТВИЕ</span>}
                          <span className="text-neutral-700">•</span>
                          <span>Ход {msg.turn}</span>
                        </div>
                        <div className="markdown-body text-sm leading-relaxed">
                          <Markdown>{msg.content}</Markdown>
                        </div>
                      </div>
                    );
                  }
                  
                  return (
                    <div key={msg.id} className={cn(
                      "rounded-xl p-4 text-sm",
                      msg.role === 'system' ? "bg-orange-900/10 border border-orange-900/30 text-orange-100" :
                      msg.role === 'ai' ? "bg-neutral-900 border border-neutral-800 text-neutral-100" :
                      "bg-neutral-900/50 border border-neutral-800/50 text-neutral-300"
                    )}>
                      <div className="text-xs font-semibold uppercase tracking-wider mb-2 flex items-center gap-2 text-neutral-500">
                        {msg.role === 'system' ? 'Гейм-мастер (Система)' : 
                         msg.role === 'ai' ? 'Гейм-мастер (ИИ)' : 'Действия игроков'}
                        <span className="text-neutral-700">•</span>
                        <span>Ход {msg.turn}</span>
                      </div>
                      <div className="markdown-body text-sm leading-relaxed">
                        <Markdown>{msg.content}</Markdown>
                      </div>
                    </div>
                  );
                })}
                
                {room.isGenerating && (
                  <div className="rounded-xl p-4 bg-neutral-900 border border-neutral-800 text-neutral-100 flex items-center gap-3 text-sm">
                    <Loader2 size={16} className="animate-spin text-orange-500" />
                    <span className="text-neutral-400 animate-pulse">{typingIndicator || "Гейм-мастер думает..."}</span>
                  </div>
                )}
                
                {generationError && isHost && (
                  <div className="rounded-xl p-4 bg-red-900/20 border border-red-900/50 text-red-200 flex flex-col gap-3 text-sm">
                    <span className="font-medium">{generationError}</span>
                    <button 
                      onClick={() => { generatingTurnRef.current = null; generateAIResponse(); }} 
                      className="bg-red-600 hover:bg-red-500 text-white px-4 py-2 rounded-lg w-fit transition-colors"
                    >
                      Повторить попытку
                    </button>
                  </div>
                )}
                
                {isHost && !room.isGenerating && players.some(p => p.isReady) && !players.every(p => p.isReady) && (
                  <div className="flex justify-center py-2">
                    <button 
                      onClick={() => { generatingTurnRef.current = room.turn; generateAIResponse(); }}
                      className="text-xs text-neutral-500 hover:text-orange-400 transition-colors flex items-center gap-1"
                    >
                      <Play size={12} />
                      Форсировать ход (не все готовы)
                    </button>
                  </div>
                )}
                <div ref={messagesEndRef} className="h-px" />
              </>
            )}
          </div>
        )}
      </div>

      {/* Input Area (Only visible in Chat tab when playing) */}
      {activeTab === 'chat' && room.status === 'playing' && (
        <div className="shrink-0 p-3 bg-neutral-900 border-t border-neutral-800">
          {isSpectator ? (
            <div className="text-center text-neutral-500 py-3 text-sm">
              Вы находитесь в режиме наблюдателя.
            </div>
          ) : me?.isReady ? (
            <div className="bg-neutral-800 border border-neutral-700 rounded-lg p-3 text-sm flex items-center justify-between">
              <div className="flex items-center gap-3 text-neutral-400 overflow-hidden">
                <Loader2 size={16} className="animate-spin shrink-0" />
                <span className="truncate">{me.action}</span>
              </div>
            </div>
          ) : (
            <div className="relative">
              {showCommands && (
                <div className="absolute bottom-full left-0 right-0 mb-2 bg-neutral-900 border border-neutral-800 rounded-xl shadow-xl overflow-hidden max-h-48 overflow-y-auto z-50">
                  {filteredCommands.length > 0 ? (
                    filteredCommands.map((c, i) => (
                      <button
                        key={i}
                        onClick={() => handleCommandSelect(c.cmd)}
                        className="w-full text-left px-4 py-3 hover:bg-neutral-800 transition-colors flex flex-col gap-1 border-b border-neutral-800/50 last:border-0"
                      >
                        <span className="text-orange-500 font-mono text-sm">{c.cmd}</span>
                        <span className="text-neutral-400 text-xs">{c.desc}</span>
                      </button>
                    ))
                  ) : (
                    <div className="px-4 py-3 text-neutral-500 text-sm">Команда не найдена</div>
                  )}
                </div>
              )}
              <form onSubmit={handleSubmitAction} className="flex gap-2">
                <div className="relative flex-1">
                  <input
                    type="text"
                    value={actionInput}
                    onChange={handleInputChange}
                    placeholder={`Что делает ${me?.name}? (введите / для команд)`}
                    className="w-full bg-black border border-neutral-700 rounded-full py-3 pl-4 pr-12 text-sm text-neutral-100 focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500 outline-none"
                    disabled={isSubmittingAction || room.isGenerating}
                  />
                  <button
                    type="button"
                    onClick={handleVoiceInput}
                    className={cn(
                      "absolute right-2 top-1.5 bottom-1.5 aspect-square flex items-center justify-center rounded-full transition-colors",
                      isRecording ? "text-red-500 bg-red-500/10 animate-pulse" : "text-neutral-400 hover:text-white"
                    )}
                    disabled={isSubmittingAction || room.isGenerating}
                  >
                    <Mic size={18} />
                  </button>
                </div>
                <button
                  type="submit"
                  disabled={!actionInput.trim() || isSubmittingAction || room.isGenerating}
                  className="w-12 h-12 shrink-0 flex items-center justify-center bg-orange-600 hover:bg-orange-500 text-white rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Send size={18} />
                </button>
              </form>
            </div>
          )}
        </div>
      )}

      {/* Bottom Navigation */}
      <div className="shrink-0 bg-neutral-900 border-t border-neutral-800 flex items-center justify-around p-2 pb-safe z-20">
        <button
          onClick={() => setActiveTab('inventory')}
          className={cn(
            "flex flex-col items-center justify-center p-2 w-20 rounded-lg transition-colors",
            activeTab === 'inventory' ? "text-orange-500" : "text-neutral-500 hover:text-neutral-300"
          )}
        >
          <Backpack size={20} className="mb-1" />
          <span className="text-[10px] font-medium">Инвентарь</span>
        </button>
        
        <button
          onClick={() => setActiveTab('chat')}
          className={cn(
            "flex flex-col items-center justify-center p-2 w-20 rounded-lg transition-colors",
            activeTab === 'chat' ? "text-orange-500" : "text-neutral-500 hover:text-neutral-300"
          )}
        >
          <MessageSquare size={20} className="mb-1" />
          <span className="text-[10px] font-medium">Чат</span>
        </button>
        
        <button
          onClick={() => setActiveTab('state')}
          className={cn(
            "flex flex-col items-center justify-center p-2 w-20 rounded-lg transition-colors",
            activeTab === 'state' ? "text-orange-500" : "text-neutral-500 hover:text-neutral-300"
          )}
        >
          <Sparkles size={20} className="mb-1" />
          <span className="text-[10px] font-medium">Состояние</span>
        </button>
      </div>
    </div>
  );
}
