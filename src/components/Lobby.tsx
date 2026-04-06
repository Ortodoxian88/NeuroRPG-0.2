import React, { useState } from 'react';
import { doc, setDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { Plus, LogIn, BookOpen } from 'lucide-react';

interface LobbyProps {
  onOpenBestiary: () => void;
}

export default function Lobby({ onOpenBestiary }: LobbyProps) {
  const [joinCode, setJoinCode] = useState('');
  const [scenario, setScenario] = useState('Вы очнулись в темной, сырой пещере. Вы не помните, как сюда попали. Вдалеке мерцает тусклый свет.');
  const [isCreating, setIsCreating] = useState(false);

  const handleCreateRoom = async () => {
    if (!auth.currentUser) return;
    setIsCreating(true);
    try {
      const roomId = Math.random().toString(36).substring(2, 8).toUpperCase();
      const roomRef = doc(db, 'rooms', roomId);
      
      await setDoc(roomRef, {
        hostId: auth.currentUser.uid,
        scenario: scenario,
        turn: 0,
        status: 'lobby',
        quests: [],
        createdAt: serverTimestamp()
      });
      
      // Update user profile to persist session
      await setDoc(doc(db, 'users', auth.currentUser.uid), { currentRoomId: roomId }, { merge: true });
    } catch (error) {
      console.error("Error creating room", error);
      alert("Не удалось создать комнату.");
    } finally {
      setIsCreating(false);
    }
  };

  const handleJoinRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (joinCode.trim() && auth.currentUser) {
      const roomId = joinCode.trim().toUpperCase();
      try {
        const roomRef = doc(db, 'rooms', roomId);
        const roomSnap = await getDoc(roomRef);
        if (!roomSnap.exists()) {
          alert("Комната с таким кодом не найдена.");
          return;
        }
        // First reset, then set to ensure a fresh state if already in a room
        await setDoc(doc(db, 'users', auth.currentUser.uid), { currentRoomId: null }, { merge: true });
        await setDoc(doc(db, 'users', auth.currentUser.uid), { currentRoomId: roomId }, { merge: true });
      } catch (error) {
        console.error("Error joining room", error);
        alert("Произошла ошибка при попытке войти в комнату.");
      }
    }
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-4 overflow-y-auto">
      <div className="w-full space-y-8 pb-8">
        
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-6 space-y-6">
          <div>
            <h2 className="text-xl font-semibold text-white flex items-center gap-2 font-display">
              <Plus size={20} className="text-orange-500" />
              Создать новую игру
            </h2>
            <p className="text-sm text-neutral-400 mt-1">Начните новое приключение в роли Гейм-мастера.</p>
          </div>
          
          <div className="space-y-2">
            <label className="block text-sm font-medium text-neutral-300">Начальный сценарий</label>
            <textarea
              value={scenario}
              onChange={(e) => setScenario(e.target.value)}
              rows={4}
              className="w-full bg-black border border-neutral-800 rounded-lg p-3 text-neutral-100 focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500 outline-none resize-none"
              placeholder="Опишите стартовую ситуацию..."
            />
          </div>
          
          <button
            onClick={handleCreateRoom}
            disabled={isCreating || !scenario.trim()}
            className="w-full bg-orange-600 hover:bg-orange-500 text-white font-medium py-3 px-4 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isCreating ? 'Создание...' : 'Создать комнату'}
          </button>
        </div>

        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-neutral-800"></div>
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="px-2 bg-black text-neutral-500">ИЛИ</span>
          </div>
        </div>

        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-6 space-y-6">
          <div>
            <h2 className="text-xl font-semibold text-white flex items-center gap-2 font-display">
              <LogIn size={20} className="text-orange-500" />
              Присоединиться к игре
            </h2>
            <p className="text-sm text-neutral-400 mt-1">Введите код комнаты, чтобы присоединиться к друзьям.</p>
          </div>
          
          <form onSubmit={handleJoinRoom} className="space-y-4">
            <div className="space-y-2">
              <label className="block text-sm font-medium text-neutral-300">Код комнаты</label>
              <input
                type="text"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                className="w-full bg-black border border-neutral-800 rounded-lg p-3 text-neutral-100 focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500 outline-none uppercase tracking-widest font-mono"
                placeholder="Например: A1B2C3"
                maxLength={6}
              />
            </div>
            <button
              type="submit"
              disabled={!joinCode.trim()}
              className="w-full bg-orange-600 hover:bg-orange-500 text-white font-medium py-3 px-4 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Войти в комнату
            </button>
          </form>
        </div>

        <button
          onClick={onOpenBestiary}
          className="w-full bg-neutral-900 border border-neutral-800 hover:bg-neutral-800 text-white font-medium py-4 px-4 rounded-xl transition-colors flex items-center justify-center gap-3"
        >
          <BookOpen size={20} className="text-orange-500" />
          Открыть Бестиарий
        </button>

      </div>
    </div>
  );
}
