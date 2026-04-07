import React, { useState, useEffect } from 'react';
import { doc, setDoc, getDoc, getDocs, serverTimestamp, collection, query, where, onSnapshot, updateDoc, documentId } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { Plus, LogIn, BookOpen, PlayCircle, Shield, Bug, Settings, LogOut } from 'lucide-react';

interface LobbyProps {
  onOpenBestiary: () => void;
  onOpenSettings: () => void;
  onOpenReport: () => void;
}

interface ActiveRoom {
  id: string;
  scenario: string;
  hostId: string;
  status: string;
}

export default function Lobby({ onOpenBestiary, onOpenSettings, onOpenReport }: LobbyProps) {
  const [joinCode, setJoinCode] = useState('');
  const [scenario, setScenario] = useState('Вы очнулись в темной, сырой пещере. Вы не помните, как сюда попали. Вдалеке мерцает тусклый свет.');
  const [isCreating, setIsCreating] = useState(false);
  const [activeRooms, setActiveRooms] = useState<ActiveRoom[]>([]);
  const [loadingRooms, setLoadingRooms] = useState(true);

  const handleLogout = () => {
    auth.signOut();
  };

  useEffect(() => {
    if (!auth.currentUser) return;
    
    const userRef = doc(db, 'users', auth.currentUser.uid);
    const unsubUser = onSnapshot(userRef, async (docSnap) => {
      if (docSnap.exists()) {
        const userData = docSnap.data();
        const roomIds = userData.activeRoomIds || [];
        
        // Also include rooms where user is host (just in case they aren't in the list)
        const hostQuery = query(collection(db, 'rooms'), where('hostId', '==', auth.currentUser.uid));
        const hostSnap = await getDocs(hostQuery);
        
        const hostRoomIds = hostSnap.docs.map(d => d.id);
        const allRoomIds = Array.from(new Set([...roomIds, ...hostRoomIds]));
        
        // For simplicity, let's just listen to the specific rooms in the list
        if (allRoomIds.length > 0) {
          const roomsQuery = query(collection(db, 'rooms'), where(documentId(), 'in', allRoomIds.slice(0, 10)));
          onSnapshot(roomsQuery, (snapshot) => {
            const rooms = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ActiveRoom));
            setActiveRooms(rooms);
            setLoadingRooms(false);
          });
        } else {
          setActiveRooms([]);
          setLoadingRooms(false);
        }
      }
    });

    return () => unsubUser();
  }, []);

  const handleSwitchRoom = async (roomId: string) => {
    if (!auth.currentUser) return;
    await setDoc(doc(db, 'users', auth.currentUser.uid), { currentRoomId: roomId }, { merge: true });
  };

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
      
      // Update user profile to persist session and add to active rooms
      const userRef = doc(db, 'users', auth.currentUser.uid);
      const userSnap = await getDoc(userRef);
      const userData = userSnap.data();
      const activeRoomIds = userData?.activeRoomIds || [];
      if (!activeRoomIds.includes(roomId)) {
        activeRoomIds.push(roomId);
      }
      
      await updateDoc(userRef, { 
        currentRoomId: roomId,
        activeRoomIds: activeRoomIds
      });
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
        const userRef = doc(db, 'users', auth.currentUser.uid);
        const userSnap = await getDoc(userRef);
        const userData = userSnap.data();
        const activeRoomIds = userData?.activeRoomIds || [];
        if (!activeRoomIds.includes(roomId)) {
          activeRoomIds.push(roomId);
        }
        
        await updateDoc(userRef, { 
          currentRoomId: roomId,
          activeRoomIds: activeRoomIds
        });
      } catch (error) {
        console.error("Error joining room", error);
        alert("Произошла ошибка при попытке войти в комнату.");
      }
    }
  };

  return (
    <div className="flex-1 flex flex-col p-4 overflow-y-auto bg-black">
      <div className="w-full space-y-6 pb-20">
        
        {/* Active Sessions Section */}
        {activeRooms.length > 0 && (
          <div className="w-full space-y-3">
            <h2 className="text-base font-bold text-neutral-400 flex items-center gap-2 uppercase tracking-widest">
              <PlayCircle size={20} className="text-orange-500" />
              Активные сессии
            </h2>
            <div className="grid gap-2">
              {activeRooms.map(room => (
                <button
                  key={room.id}
                  onClick={() => handleSwitchRoom(room.id)}
                  className="w-full bg-neutral-900/50 border border-neutral-800 hover:border-orange-500/50 p-3 rounded-2xl text-left transition-all group"
                >
                  <div className="flex justify-between items-center mb-2">
                    <span className="font-mono text-xs text-orange-500 bg-orange-500/10 px-2 py-1 rounded font-bold">
                      {room.id}
                    </span>
                    {room.hostId === auth.currentUser?.uid && (
                      <span className="text-[10px] bg-blue-500/20 text-blue-400 px-2 py-1 rounded font-bold uppercase tracking-tighter">
                        ГМ
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-neutral-400 line-clamp-2 italic">
                    "{room.scenario}"
                  </p>
                </button>
              ))}
            </div>
          </div>
        )}
        
        <div className="grid grid-cols-1 gap-4">
          <div className="bg-neutral-900/50 border border-neutral-800 rounded-3xl p-6 space-y-5">
            <h2 className="text-base font-bold text-white flex items-center gap-2 uppercase tracking-widest">
              <Plus size={24} className="text-orange-500" />
              Новая игра
            </h2>
            <textarea
              value={scenario}
              onChange={(e) => setScenario(e.target.value)}
              rows={4}
              className="w-full bg-black border border-neutral-800 rounded-2xl p-4 text-base text-neutral-100 focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500 outline-none resize-none"
              placeholder="Опишите стартовую ситуацию..."
            />
            <button
              onClick={handleCreateRoom}
              disabled={isCreating || !scenario.trim()}
              className="w-full bg-orange-600 hover:bg-orange-500 text-white font-bold py-4 px-4 rounded-2xl transition-all active:scale-95 disabled:opacity-50 text-base"
            >
              {isCreating ? 'Создание...' : 'Создать комнату'}
            </button>
          </div>

          <div className="bg-neutral-900/50 border border-neutral-800 rounded-3xl p-6 space-y-5">
            <h2 className="text-base font-bold text-white flex items-center gap-2 uppercase tracking-widest">
              <LogIn size={24} className="text-orange-500" />
              Присоединиться
            </h2>
            <div className="flex gap-3">
              <input
                type="text"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                className="flex-1 min-w-0 bg-black border border-neutral-800 rounded-2xl p-4 text-base text-neutral-100 focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500 outline-none uppercase tracking-widest font-mono"
                placeholder="КОД"
                maxLength={6}
              />
              <button
                onClick={handleJoinRoom}
                disabled={!joinCode.trim()}
                className="bg-neutral-800 hover:bg-neutral-700 text-white font-bold px-6 rounded-2xl transition-all active:scale-95 disabled:opacity-50 text-base shrink-0"
              >
                Войти
              </button>
            </div>
          </div>
        </div>

        <button
          onClick={onOpenBestiary}
          className="w-full bg-neutral-900/50 border border-neutral-800 hover:bg-neutral-800 text-white font-bold py-5 px-4 rounded-3xl transition-all active:scale-95 flex items-center justify-center gap-3 text-base uppercase tracking-widest"
        >
          <BookOpen size={24} className="text-orange-500" />
          Бестиарий
        </button>
      </div>

      {/* Footer Navigation */}
      <div className="absolute bottom-0 left-0 right-0 p-4 pb-safe bg-black/90 backdrop-blur-md border-t border-neutral-900 flex justify-around items-center z-20">
        <button 
          onClick={onOpenReport}
          className="flex flex-col items-center gap-1.5 text-neutral-500 hover:text-white transition-colors p-2"
        >
          <Bug size={24} />
          <span className="text-[10px] font-bold uppercase tracking-tighter">Баги</span>
        </button>
        <button 
          onClick={onOpenSettings}
          className="flex flex-col items-center gap-1.5 text-neutral-500 hover:text-white transition-colors p-2"
        >
          <Settings size={24} />
          <span className="text-[10px] font-bold uppercase tracking-tighter">Опции</span>
        </button>
        <button 
          onClick={handleLogout}
          className="flex flex-col items-center gap-1.5 text-neutral-500 hover:text-red-400 transition-colors p-2"
        >
          <LogOut size={24} />
          <span className="text-[10px] font-bold uppercase tracking-tighter">Выход</span>
        </button>
      </div>
    </div>
  );
}
