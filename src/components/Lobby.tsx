import React, { useState, useEffect } from 'react';
import { supabase, logout } from '../supabase';
import { AppSettings } from '../types';
import { cn } from '../lib/utils';
import { Plus, LogIn, BookOpen, PlayCircle, Shield, Bug, Settings, LogOut, Loader2, Users } from 'lucide-react';
import { api } from '../services/api';

interface LobbyProps {
  onOpenBestiary: () => void;
  onOpenSettings: () => void;
  onOpenReport: () => void;
  appSettings: AppSettings;
  onRoomSelected: (roomId: string) => void;
}

interface ActiveRoom {
  id: string;
  scenario?: string;
  world_settings?: any;
  host_user_id: string;
  status: string;
  join_code: string;
}

export default function Lobby({ onOpenBestiary, onOpenSettings, onOpenReport, appSettings, onRoomSelected }: LobbyProps) {
  const [joinCode, setJoinCode] = useState('');
  const [scenario, setScenario] = useState('Вы очнулись в темной, сырой пещере. Вы не помните, как сюда попали. Вдалеке мерцает тусклый свет.');
  const [isCreating, setIsCreating] = useState(false);
  const [activeRooms, setActiveRooms] = useState<ActiveRoom[]>([]);
  const [loadingRooms, setLoadingRooms] = useState(true);

  const handleLogout = () => {
    logout();
  };

  useEffect(() => {
    const checkUser = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      
      try {
        const rooms = await api.getRooms();
        setActiveRooms(rooms);
      } catch (error) {
        console.error('Failed to load rooms:', error);
      } finally {
        setLoadingRooms(false);
      }
    };

    checkUser();
  }, []);

  const handleSwitchRoom = async (roomId: string) => {
    onRoomSelected(roomId);
  };

  const handleCreateRoom = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    setIsCreating(true);
    try {
      const room = await api.createRoom(scenario);
      onRoomSelected(room.id);
    } catch (error) {
      console.error("Error creating room", error);
      alert("Не удалось создать комнату.");
    } finally {
      setIsCreating(false);
    }
  };

  const handleJoinRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    const { data: { session } } = await supabase.auth.getSession();
    if (joinCode.trim() && session) {
      try {
        // We just navigate to the room view, joining will happen there if needed
        // But we need to find the room ID by join code first.
        // For now, we'll just pass the join code to a new state in App.tsx, or we can fetch it here.
        // Actually, let's just use the join code directly as the room ID in the frontend for now,
        // and the RoomView will handle the actual joining process.
        // Wait, the API needs the join code to join.
        // Let's just pass the join code to App.tsx which will pass it to RoomView.
        onRoomSelected(joinCode.trim().toUpperCase());
      } catch (error) {
        console.error("Error joining room", error);
        alert("Произошла ошибка при попытке войти в комнату.");
      }
    }
  };

  return (
    <div className={cn(
      "flex-1 flex flex-col overflow-hidden relative h-full",
      appSettings.theme === 'light' ? "bg-neutral-50" : "bg-black"
    )}>
      {/* Scrollable Content Area */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="w-full space-y-6 pb-6">
          
          {/* Active Sessions Section */}
          {activeRooms.length > 0 && (
            <div className="w-full space-y-3">
              <h2 className={cn(
                "text-base font-bold flex items-center gap-2 uppercase tracking-widest",
                appSettings.theme === 'light' ? "text-neutral-500" : "text-neutral-400"
              )}>
                <PlayCircle size={20} className="text-orange-500" />
                Активные сессии
              </h2>
              <div className="grid gap-2">
                {activeRooms.map(room => (
                  <button
                    key={room.id}
                    onClick={() => handleSwitchRoom(room.id)}
                    className={cn(
                      "w-full border p-3 rounded-2xl text-left transition-all group",
                      appSettings.theme === 'light' 
                        ? "bg-white border-neutral-200 hover:border-orange-500/50 shadow-sm" 
                        : "bg-neutral-900/50 border-neutral-800 hover:border-orange-500/50"
                    )}
                  >
                    <div className="flex justify-between items-center mb-2">
                      <span className="font-mono text-xs text-orange-500 bg-orange-500/10 px-2 py-1 rounded font-bold">
                        {room.join_code}
                      </span>
                      <div className={cn(
                        "flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest",
                        appSettings.theme === 'light' ? "text-neutral-400" : "text-neutral-500"
                      )}>
                        <Users size={12} />
                        <span>? / 6</span>
                      </div>
                    </div>
                    <p className={cn(
                      "text-sm line-clamp-2 italic",
                      appSettings.theme === 'light' ? "text-neutral-600" : "text-neutral-400"
                    )}>
                      "{room.world_settings?.scenario || room.scenario}"
                    </p>
                  </button>
                ))}
              </div>
            </div>
          )}
          
          <div className="grid grid-cols-1 gap-4">
            <div className={cn(
              "border rounded-3xl p-6 space-y-5",
              appSettings.theme === 'light' ? "bg-white border-neutral-200 shadow-sm" : "bg-neutral-900/50 border-neutral-800"
            )}>
              <h2 className={cn(
                "text-base font-bold flex items-center gap-2 uppercase tracking-widest",
                appSettings.theme === 'light' ? "text-neutral-900" : "text-white"
              )}>
                <Plus size={24} className="text-orange-500" />
                Новая игра
              </h2>
              <textarea
                value={scenario}
                onChange={(e) => setScenario(e.target.value)}
                rows={4}
                className={cn(
                  "w-full border rounded-2xl p-4 text-base focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500 outline-none resize-none transition-all",
                  appSettings.theme === 'light' ? "bg-neutral-50 border-neutral-200 text-neutral-900" : "bg-black border-neutral-800 text-neutral-100"
                )}
                placeholder="Опишите стартовую ситуацию..."
              />
              <button
                onClick={handleCreateRoom}
                disabled={isCreating || !scenario.trim()}
                className="w-full bg-orange-600 hover:bg-orange-500 text-white font-bold py-4 px-4 rounded-2xl transition-all active:scale-95 disabled:opacity-50 text-base shadow-lg shadow-orange-600/20 btn-press"
              >
                {isCreating ? 'Создание...' : 'Создать комнату'}
              </button>
            </div>

            <div className={cn(
              "border rounded-3xl p-6 space-y-5",
              appSettings.theme === 'light' ? "bg-white border-neutral-200 shadow-sm" : "bg-neutral-900/50 border-neutral-800"
            )}>
              <h2 className={cn(
                "text-base font-bold flex items-center gap-2 uppercase tracking-widest",
                appSettings.theme === 'light' ? "text-neutral-900" : "text-white"
              )}>
                <LogIn size={24} className="text-orange-500" />
                Присоединиться
              </h2>
              <div className="flex gap-3">
                <input
                  type="text"
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                  className={cn(
                    "flex-1 min-w-0 border rounded-2xl p-4 text-base focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500 outline-none uppercase tracking-widest font-mono transition-all",
                    appSettings.theme === 'light' ? "bg-neutral-50 border-neutral-200 text-neutral-900" : "bg-black border-neutral-800 text-neutral-100"
                  )}
                  placeholder="КОД"
                  maxLength={6}
                />
                <button
                  onClick={handleJoinRoom}
                  disabled={!joinCode.trim()}
                  className={cn(
                    "font-bold px-6 rounded-2xl transition-all active:scale-95 disabled:opacity-50 text-base shrink-0 btn-press",
                    appSettings.theme === 'light' ? "bg-neutral-100 hover:bg-neutral-200 text-neutral-900" : "bg-neutral-800 hover:bg-neutral-700 text-white"
                  )}
                >
                  Войти
                </button>
              </div>
            </div>
          </div>

          <button
            onClick={onOpenBestiary}
            className={cn(
              "w-full border font-bold py-5 px-4 rounded-3xl transition-all active:scale-95 flex items-center justify-center gap-3 text-base uppercase tracking-widest btn-press",
              appSettings.theme === 'light' 
                ? "bg-white border-neutral-200 hover:bg-neutral-50 text-neutral-900 shadow-sm" 
                : "bg-neutral-900/50 border-neutral-800 hover:bg-neutral-800 text-white"
            )}
          >
            <BookOpen size={24} className="text-orange-500" />
            Бестиарий
          </button>
        </div>
      </div>

      {/* Footer Navigation - Fixed at the bottom */}
      <div className={cn(
        "shrink-0 p-4 pb-safe backdrop-blur-md border-t flex justify-around items-center z-20",
        appSettings.theme === 'light' ? "bg-white/90 border-neutral-200" : "bg-black/90 border-neutral-900"
      )}>
        <button 
          onClick={onOpenReport}
          className={cn(
            "flex flex-col items-center gap-1.5 transition-colors p-2",
            appSettings.theme === 'light' ? "text-neutral-400 hover:text-neutral-900" : "text-neutral-500 hover:text-white"
          )}
        >
          <Bug size={24} />
          <span className="text-[10px] font-bold uppercase tracking-tighter">Баги</span>
        </button>
        <button 
          onClick={onOpenSettings}
          className={cn(
            "flex flex-col items-center gap-1.5 transition-colors p-2",
            appSettings.theme === 'light' ? "text-neutral-400 hover:text-neutral-900" : "text-neutral-500 hover:text-white"
          )}
        >
          <Settings size={24} />
          <span className="text-[10px] font-bold uppercase tracking-tighter">Опции</span>
        </button>
        <button 
          onClick={handleLogout}
          className={cn(
            "flex flex-col items-center gap-1.5 transition-colors p-2",
            appSettings.theme === 'light' ? "text-neutral-400 hover:text-red-500" : "text-neutral-500 hover:text-red-400"
          )}
        >
          <LogOut size={24} />
          <span className="text-[10px] font-bold uppercase tracking-tighter">Выход</span>
        </button>
      </div>
    </div>
  );
}
