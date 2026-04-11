/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState } from 'react';
import { supabase } from './supabase';
import { signInWithGoogle, logout } from './supabase';
import Lobby from '@/src/components/Lobby';
import RoomView from '@/src/components/RoomView';
import BestiaryView from '@/src/components/BestiaryView';
import SettingsView from '@/src/components/SettingsView';
import ErrorBoundary from '@/src/components/ErrorBoundary';
import { LogOut, BookOpen, Home, DoorOpen, MoreVertical, Settings, Bug, X, Send, CheckCircle2, Loader2, Sparkles, Zap, Ghost, Sword, MessageSquarePlus } from 'lucide-react';
import { ConfirmModal } from './components/ConfirmModal';
import { UserProfile, AppSettings, ChatSettings } from './types';
import { cn } from '@/src/lib/utils';

type ViewState = 'main' | 'bestiary' | 'settings';

export default function App() {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [currentRoomId, setCurrentRoomId] = useState<string | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [activeView, setActiveView] = useState<ViewState>('main');
  const [showProfile, setShowProfile] = useState(false);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [confirmAction, setConfirmAction] = useState<() => void>(() => {});
  const [reportType, setReportType] = useState<'bug' | 'suggestion' | 'typo'>('bug');
  const [reportMessage, setReportMessage] = useState('');
  const [isReporting, setIsReporting] = useState(false);
  const [reportSuccess, setReportSuccess] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [isSigningIn, setIsSigningIn] = useState(false);

  // Settings State
  const [appSettings, setAppSettings] = useState<AppSettings>(() => {
    const saved = localStorage.getItem('appSettings');
    return saved ? JSON.parse(saved) : {
      goreLevel: 'medium',
      gmTone: 'classic',
      difficulty: 'normal',
      theme: 'dark',
      language: 'ru',
      soundEffects: true,
      vibration: true,
      animations: true,
      performanceMode: false
    };
  });

  const [chatSettings, setChatSettings] = useState<ChatSettings>(() => {
    const saved = localStorage.getItem('chatSettings');
    return saved ? JSON.parse(saved) : {
      fontFamily: 'sans',
      fontSize: 'md',
      lineHeight: 'normal',
      tracking: 'normal',
      boldNames: true,
      italicActions: true,
      highlightKeywords: false,
      textAlign: 'left',
      autoCapitalize: true,
      typewriterSpeed: 30,
      messageStyle: 'bubbles',
      compactMode: false,
      showTimestamps: true,
      avatarSize: 'md',
      hideSystemMessages: false,
      playerColors: true,
      aiTextColor: 'default',
      borderStyle: 'rounded',
      shadowIntensity: 'sm',
      linkColor: 'blue',
      whisperColor: 'gray',
      errorColor: 'red',
      autoScroll: true,
      smoothScroll: true,
      enableMarkdown: true,
      focusMode: false
    };
  });

  useEffect(() => {
    localStorage.setItem('appSettings', JSON.stringify(appSettings));
    if (appSettings.theme === 'light') {
      document.body.classList.add('light-theme');
    } else {
      document.body.classList.remove('light-theme');
    }
  }, [appSettings]);

  useEffect(() => {
    localStorage.setItem('chatSettings', JSON.stringify(chatSettings));
  }, [chatSettings]);

  const handleSendReport = async () => {
    if (!reportMessage.trim() || !user) return;
    setIsReporting(true);
    try {
      const reportUrl = '/api/report';
      const response = await fetch(reportUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: reportType,
          message: reportMessage,
          userEmail: user.email,
          roomId: currentRoomId,
          version: '0.2.9'
        })
      });
      if (response.ok) {
        setReportSuccess(true);
        setReportMessage('');
        setTimeout(() => {
          setReportSuccess(false);
          setShowReportModal(false);
        }, 3000);
      }
    } catch (e) {
      console.error("Report failed", e);
    } finally {
      setIsReporting(false);
    }
  };

  useEffect(() => {
    const handleClickOutside = () => setShowMoreMenu(false);
    window.addEventListener('click', handleClickOutside);
    return () => window.removeEventListener('click', handleClickOutside);
  }, []);

  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      console.warn("Unhandled rejection caught:", event.reason);
      // Suppress Vite WebSocket errors as they are benign in this environment
      if (event.reason?.message?.includes('WebSocket') || event.reason?.message?.includes('vite')) {
        event.preventDefault();
      }
    };
    window.addEventListener('unhandledrejection', handleUnhandledRejection);
    return () => window.removeEventListener('unhandledrejection', handleUnhandledRejection);
  }, []);

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        const savedRoomId = localStorage.getItem(`currentRoomId_${session.user.id}`);
        if (savedRoomId) {
          setCurrentRoomId(savedRoomId);
        }
      }
      setLoading(false);
      setProfileLoading(false);
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      console.log("Auth state changed:", session?.user?.email);
      const currentUser = session?.user ?? null;
      setUser(currentUser);
      
      if (currentUser) {
        const savedRoomId = localStorage.getItem(`currentRoomId_${currentUser.id}`);
        if (savedRoomId) {
          setCurrentRoomId(savedRoomId);
        }
      }
      
      setLoading(false);
      setProfileLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleRoomSelected = (roomId: string) => {
    if (!user) return;
    localStorage.setItem(`currentRoomId_${user.id}`, roomId);
    setCurrentRoomId(roomId);
    setActiveView('main');
  };

  const handleMinimizeRoom = async () => {
    if (!user) return;
    localStorage.removeItem(`currentRoomId_${user.id}`);
    setCurrentRoomId(null);
    setActiveView('main');
  };

  const handleLeaveRoom = async () => {
    if (!user) return;
    if (currentRoomId) {
      setConfirmAction(() => () => {
        localStorage.removeItem(`currentRoomId_${user.id}`);
        setCurrentRoomId(null);
        setActiveView('main');
        setShowConfirmModal(false);
      });
      setShowConfirmModal(true);
      return;
    }
    
    localStorage.removeItem(`currentRoomId_${user.id}`);
    setCurrentRoomId(null);
    setActiveView('main');
  };

  if (loading || profileLoading) {
    return (
      <div className="min-h-[100dvh] bg-black flex items-center justify-center text-neutral-400">
        Загрузка...
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-[100dvh] bg-black flex items-center justify-center">
        <div className="w-full max-w-md h-[100dvh] bg-black flex flex-col items-center justify-center p-8 text-neutral-100 overflow-hidden relative border-x border-neutral-900 shadow-2xl">
          <div className="flex flex-col items-center justify-center w-full space-y-12 text-center max-w-xs">
            <div className="space-y-4">
              <div className="w-24 h-24 bg-orange-600 rounded-[2.5rem] mx-auto flex items-center justify-center shadow-2xl shadow-orange-600/20 rotate-3 animate-in zoom-in duration-500">
                <span className="text-5xl font-black text-white">N</span>
              </div>
              <div className="space-y-2">
                <h1 className="text-5xl font-bold tracking-tighter text-white font-display pt-4">NeuroRPG</h1>
                <p className="text-neutral-500 text-sm font-medium uppercase tracking-[0.2em]">Цифровой Гейм-мастер</p>
              </div>
            </div>
            
            <div className="w-full space-y-4">
              {authError && (
                <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-xs p-3 rounded-xl text-left animate-in fade-in slide-in-from-bottom-2">
                  {authError}
                </div>
              )}
              <button
                onClick={async () => {
                  console.log("Sign in button clicked");
                  setAuthError(null);
                  setIsSigningIn(true);
                  const result = await signInWithGoogle();
                  if (result && !result.success) {
                    setAuthError(result.error || "Произошла неизвестная ошибка");
                    setIsSigningIn(false);
                  }
                }}
                disabled={isSigningIn}
                className="w-full flex items-center justify-center gap-4 px-4 py-5 border border-transparent text-lg font-bold rounded-3xl text-black bg-white hover:bg-neutral-200 transition-all active:scale-95 shadow-2xl shadow-white/5 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSigningIn ? (
                  <Loader2 className="w-6 h-6 animate-spin" />
                ) : (
                  <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" className="w-6 h-6" alt="" />
                )}
                {isSigningIn ? 'Вход...' : 'Войти через Google'}
              </button>
              <p className="text-[10px] text-neutral-600 font-medium uppercase tracking-widest leading-relaxed">
                Авторизация необходима для сохранения <br /> твоего прогресса и персонажей
              </p>
            </div>
          </div>

          {/* Report Modal */}
          {showReportModal && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 bg-black/80 backdrop-blur-md">
              <div className="w-full max-w-lg bg-neutral-950 border border-neutral-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col relative">
                {/* Glow effect */}
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-3/4 h-1 bg-gradient-to-r from-transparent via-orange-500 to-transparent opacity-50 blur-sm"></div>
                
                <div className="p-6 border-b border-neutral-900 flex justify-between items-center bg-neutral-900/30">
                  <div className="flex items-center gap-4">
                    <div className="p-3 bg-orange-500/10 text-orange-500 rounded-2xl border border-orange-500/20">
                      <Bug size={24} />
                    </div>
                    <div>
                      <h3 className="text-xl font-bold text-white tracking-tight">Обратная связь</h3>
                      <p className="text-xs text-neutral-500 font-medium uppercase tracking-widest mt-0.5">Нашли баг или есть идея?</p>
                    </div>
                  </div>
                  <button onClick={() => setShowReportModal(false)} className="p-2 text-neutral-500 hover:text-white hover:bg-neutral-800 rounded-xl transition-colors">
                    <X size={20} />
                  </button>
                </div>

                <div className="p-6 space-y-6">
                  {reportSuccess ? (
                    <div className="py-12 flex flex-col items-center text-center space-y-4 animate-in fade-in zoom-in duration-300">
                      <div className="w-20 h-20 bg-green-500/10 border border-green-500/20 rounded-full flex items-center justify-center text-green-500 mb-2">
                        <CheckCircle2 size={40} />
                      </div>
                      <div className="space-y-2">
                        <h3 className="text-2xl font-bold text-white">Спасибо за вклад!</h3>
                        <p className="text-sm text-neutral-400 leading-relaxed max-w-xs mx-auto">
                          Твой репорт уже летит к разработчику на крыльях цифрового дракона. Вместе мы сделаем NeuroRPG легендарной.
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-6 animate-in fade-in duration-300">
                      <div className="flex gap-2 p-1 bg-neutral-900 rounded-2xl border border-neutral-800">
                        {(['bug', 'suggestion', 'typo'] as const).map(t => (
                          <button
                            key={t}
                            onClick={() => setReportType(t)}
                            className={cn(
                              "flex-1 py-2.5 text-xs font-bold uppercase tracking-wider rounded-xl transition-all",
                              reportType === t 
                                ? "bg-neutral-800 text-white shadow-sm border border-neutral-700" 
                                : "text-neutral-500 hover:text-neutral-300"
                            )}
                          >
                            {t === 'bug' ? 'Баг' : t === 'suggestion' ? 'Идея' : 'Опечатка'}
                          </button>
                        ))}
                      </div>

                      <div className="space-y-2">
                        <label className="text-xs font-bold text-neutral-500 uppercase tracking-widest">Описание проблемы</label>
                        <textarea
                          value={reportMessage}
                          onChange={(e) => setReportMessage(e.target.value)}
                          placeholder={
                            reportType === 'bug' ? "Что сломалось? Как это повторить?" :
                            reportType === 'suggestion' ? "Опиши свою гениальную идею..." :
                            "Где мы ошиблись в тексте?"
                          }
                          className="w-full h-32 bg-neutral-900 border border-neutral-800 rounded-2xl p-4 text-white placeholder-neutral-600 focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 transition-all resize-none text-sm"
                        />
                      </div>

                      <button
                        onClick={handleSendReport}
                        disabled={isReporting || !reportMessage.trim()}
                        className="w-full flex items-center justify-center gap-2 py-4 bg-orange-600 hover:bg-orange-500 disabled:bg-neutral-800 disabled:text-neutral-600 text-white rounded-2xl font-bold transition-all"
                      >
                        {isReporting ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
                        {isReporting ? 'Отправка...' : 'Отправить репорт'}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <div className={cn(
        "h-[100dvh] text-neutral-100 font-sans flex flex-col max-w-md mx-auto relative shadow-2xl overflow-hidden border-x",
        appSettings.theme === 'black' ? "bg-black border-neutral-900" : appSettings.theme === 'light' ? "bg-white text-black border-neutral-200" : "bg-neutral-950 border-neutral-900",
        !appSettings.animations && "no-animations",
        appSettings.performanceMode && "performance-mode"
      )}>
        {isOffline && (
          <div className="bg-red-500 text-white text-[10px] font-bold text-center py-1 z-50 shrink-0 uppercase tracking-widest">
            Автономный режим
          </div>
        )}
        {activeView === 'main' && (
          <header className={cn(
            "shrink-0 border-b backdrop-blur-md p-5 flex justify-between items-center z-30",
            appSettings.theme === 'light' ? "bg-white/80 border-neutral-200" : "bg-black/80 border-neutral-900"
          )}>
            <div className="flex items-center gap-3">
              <h1 
                className={cn(
                  "text-2xl font-bold tracking-tight cursor-pointer flex items-center gap-2 font-display",
                  appSettings.theme === 'light' ? "text-black" : "text-white"
                )}
                onClick={() => { setActiveView('main'); setCurrentRoomId(currentRoomId); }}
              >
                NeuroRPG
              </h1>
              {currentRoomId && activeView === 'main' && (
                <button 
                  onClick={() => setActiveView('bestiary')} 
                  className="text-orange-500 hover:text-orange-400 flex items-center gap-1 text-sm font-bold uppercase tracking-wider bg-orange-500/10 px-3 py-1.5 rounded-lg transition-colors"
                >
                  <BookOpen size={16} /> Бестиарий
                </button>
              )}
            </div>
            <div className="flex items-center gap-2">
              {currentRoomId && activeView === 'main' ? (
                <>
                  <button
                    onClick={handleMinimizeRoom}
                    className="p-2 text-neutral-400 hover:text-white transition-colors rounded-xl hover:bg-neutral-900"
                    title="Свернуть игру"
                  >
                    <Home size={24} />
                  </button>
                  <div className="relative">
                    <button
                      onClick={(e) => { e.stopPropagation(); setShowMoreMenu(!showMoreMenu); }}
                      className="p-2 text-neutral-400 hover:text-white transition-colors rounded-xl hover:bg-neutral-900"
                    >
                      <MoreVertical size={24} />
                    </button>
                    
                    {showMoreMenu && (
                      <div className="absolute right-0 mt-2 w-56 bg-neutral-900 border border-neutral-800 rounded-2xl shadow-2xl overflow-hidden z-50">
                        <button 
                          onClick={() => { setActiveView('settings'); setShowMoreMenu(false); }}
                          className="w-full flex items-center gap-3 px-5 py-4 text-base text-neutral-300 hover:bg-neutral-800 transition-colors"
                        >
                          <Settings size={20} /> Настройки
                        </button>
                        <button 
                          onClick={() => { handleLeaveRoom(); setShowMoreMenu(false); }}
                          className="w-full flex items-center gap-3 px-5 py-4 text-base text-red-400 hover:bg-red-500/10 transition-colors"
                        >
                          <DoorOpen size={20} /> Покинуть сессию
                        </button>
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <button 
                  onClick={() => setShowProfile(true)}
                  className="flex items-center gap-3 hover:bg-neutral-900 p-1.5 rounded-2xl transition-all active:scale-95"
                >
                    <span className="text-sm font-bold text-neutral-500 uppercase tracking-widest truncate max-w-[80px]">{user.user_metadata?.full_name?.split(' ')[0] || user.email?.split('@')[0]}</span>
                    <div className="w-10 h-10 rounded-full bg-neutral-800 border border-neutral-700 flex items-center justify-center overflow-hidden">
                      {user.user_metadata?.avatar_url ? <img src={user.user_metadata.avatar_url} alt="" /> : <span className="text-base">{user.email?.[0].toUpperCase()}</span>}
                    </div>
                </button>
              )}
            </div>
          </header>
        )}

        <main className="flex-1 flex flex-col relative overflow-hidden">
          {showProfile ? (
            <div className={cn(
              "flex-1 flex flex-col p-6 space-y-8 overflow-y-auto",
              appSettings.theme === 'light' ? "bg-white" : "bg-black"
            )}>
              <div className="flex justify-between items-center">
                <h2 className="text-2xl font-bold font-display">Профиль</h2>
                <button onClick={() => setShowProfile(false)} className="p-2 text-neutral-500 hover:text-white">
                  <X size={24} />
                </button>
              </div>

              <div className="flex flex-col items-center text-center space-y-4 py-4">
                <div className="w-32 h-32 rounded-[2.5rem] bg-neutral-800 border-2 border-orange-500/30 flex items-center justify-center overflow-hidden shadow-2xl shadow-orange-500/10">
                  {user.user_metadata?.avatar_url ? (
                    <img src={user.user_metadata.avatar_url} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-5xl font-bold">{user.email?.[0].toUpperCase()}</span>
                  )}
                </div>
                <div>
                  <h3 className="text-2xl font-bold text-white">{user.user_metadata?.full_name || user.email?.split('@')[0]}</h3>
                  <p className="text-neutral-500 text-sm">{user.email}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="bg-neutral-900/50 border border-neutral-800 p-4 rounded-3xl space-y-1">
                  <p className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest">Статус</p>
                  <p className="text-white font-bold flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                    В сети
                  </p>
                </div>
                <div className="bg-neutral-900/50 border border-neutral-800 p-4 rounded-3xl space-y-1">
                  <p className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest">ID</p>
                  <p className="text-white font-mono text-xs truncate">{user.id.slice(0, 8)}...</p>
                </div>
              </div>

              <div className="space-y-4">
                <h4 className="text-xs font-bold text-neutral-500 uppercase tracking-widest px-2">Управление</h4>
                <button 
                  onClick={() => { setShowProfile(false); setActiveView('settings'); }}
                  className="w-full flex items-center gap-4 p-4 bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 rounded-2xl transition-all"
                >
                  <Settings size={20} className="text-neutral-400" />
                  <span className="font-bold">Настройки</span>
                </button>
                <button 
                  onClick={() => { logout(); setShowProfile(false); }}
                  className="w-full flex items-center gap-4 p-4 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 rounded-2xl transition-all text-red-500"
                >
                  <LogOut size={20} />
                  <span className="font-bold">Выйти из аккаунта</span>
                </button>
              </div>
            </div>
          ) : activeView === 'bestiary' ? (
            <BestiaryView onBack={() => setActiveView('main')} appSettings={appSettings} />
          ) : activeView === 'settings' ? (
            <SettingsView 
              appSettings={appSettings} 
              setAppSettings={setAppSettings} 
              chatSettings={chatSettings} 
              setChatSettings={setChatSettings} 
              onClose={() => setActiveView('main')} 
            />
          ) : currentRoomId ? (
            <RoomView 
              roomId={currentRoomId} 
              user={user}
              onLeave={handleLeaveRoom} 
              onMinimize={handleMinimizeRoom}
              onOpenBestiary={() => setActiveView('bestiary')} 
              appSettings={appSettings}
              chatSettings={chatSettings}
            />
          ) : (
            <Lobby 
              onOpenBestiary={() => setActiveView('bestiary')} 
              onOpenSettings={() => setActiveView('settings')}
              onOpenReport={() => setShowReportModal(true)}
              appSettings={appSettings}
              onRoomSelected={handleRoomSelected}
            />
          )}
        </main>
        
        {/* Confirm Modal */}
        <ConfirmModal
          isOpen={showConfirmModal}
          title="Покинуть игру"
          message="Вы уверены, что хотите полностью покинуть эту игру? Ваш персонаж останется в истории, но вы больше не будете активным участником."
          onConfirm={confirmAction}
          onCancel={() => setShowConfirmModal(false)}
          appSettings={appSettings}
        />

        {/* Global Report Modal (for logged in users) */}
        {showReportModal && user && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/90 backdrop-blur-sm">
            <div className="w-full max-w-sm bg-neutral-900 border border-neutral-800 rounded-3xl p-6 shadow-2xl space-y-6">
              {reportSuccess ? (
                <div className="py-8 flex flex-col items-center text-center space-y-4">
                  <div className="w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center text-green-500">
                    <CheckCircle2 size={40} />
                  </div>
                  <div className="space-y-2">
                    <h3 className="text-xl font-bold text-white">Спасибо за вклад!</h3>
                    <p className="text-sm text-neutral-400 leading-relaxed">
                      Твой репорт уже летит к разработчику на крыльях цифрового дракона. Вместе мы сделаем NeuroRPG легендарной.
                    </p>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex justify-between items-center">
                    <h3 className="text-lg font-bold text-white flex items-center gap-2">
                      <Bug size={20} className="text-orange-500" />
                      Обратная связь
                    </h3>
                    <button onClick={() => setShowReportModal(false)} className="text-neutral-500 hover:text-white">
                      <X size={20} />
                    </button>
                  </div>

                  <div className="flex gap-2">
                    {(['bug', 'suggestion', 'typo'] as const).map(t => (
                      <button
                        key={t}
                        onClick={() => setReportType(t)}
                        className={cn(
                          "flex-1 py-3 text-xs font-bold uppercase tracking-widest rounded-xl border transition-all",
                          reportType === t ? "bg-orange-600 border-orange-500 text-white" : "bg-neutral-800 border-neutral-700 text-neutral-500"
                        )}
                      >
                        {t === 'bug' ? 'Баг' : t === 'suggestion' ? 'Идея' : 'Текст'}
                      </button>
                    ))}
                  </div>

                  <textarea
                    value={reportMessage}
                    onChange={(e) => setReportMessage(e.target.value)}
                    placeholder="Опиши проблему или идею..."
                    className="w-full h-32 bg-black border border-neutral-800 rounded-2xl p-4 text-base text-white outline-none focus:border-orange-500 transition-colors resize-none"
                  />

                  <button
                    onClick={handleSendReport}
                    disabled={isReporting || !reportMessage.trim()}
                    className="w-full py-4 bg-white text-black font-bold text-base rounded-2xl flex items-center justify-center gap-2 hover:bg-neutral-200 transition-all disabled:opacity-50"
                  >
                    {isReporting ? <Loader2 size={24} className="animate-spin" /> : <Send size={24} />}
                    Отправить отчет
                  </button>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </ErrorBoundary>
  );
}
