import React, { useEffect, useRef } from 'react';
import { Message, ChatSettings } from '@/src/types';
import { Loader2 } from 'lucide-react';
import Markdown from 'react-markdown';
import { cn } from '@/src/lib/utils';
import { User } from 'firebase/auth';

interface ChatAreaProps {
  messages: Message[];
  currentUser: User | null;
  isGenerating: boolean;
  typingIndicator: string;
  generationError: string | null;
  isHost: boolean;
  onRetryGeneration: () => void;
  onForceTurn: () => void;
  playersCount: number;
  readyPlayersCount: number;
  chatSettings?: ChatSettings;
}

export default function ChatArea({
  messages,
  currentUser,
  isGenerating,
  typingIndicator,
  generationError,
  isHost,
  onRetryGeneration,
  onForceTurn,
  playersCount,
  readyPlayersCount,
  chatSettings
}: ChatAreaProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastMessageCount = useRef(messages.length);

  useEffect(() => {
    if (messages.length > lastMessageCount.current) {
      scrollRef.current?.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: 'smooth'
      });
    }
    lastMessageCount.current = messages.length;
  }, [messages.length]);

  const getFontClass = () => {
    if (!chatSettings) return 'font-sans';
    switch (chatSettings.fontFamily) {
      case 'serif': return 'font-serif';
      case 'mono': return 'font-mono';
      case 'dyslexic': return 'font-opendyslexic';
      default: return 'font-sans';
    }
  };

  const getSizeClass = () => {
    if (!chatSettings) return 'text-base';
    switch (chatSettings.fontSize) {
      case 'sm': return 'text-sm';
      case 'lg': return 'text-lg';
      default: return 'text-base';
    }
  };

  const getAlignClass = () => {
    if (!chatSettings) return 'text-left';
    return chatSettings.textAlign === 'justify' ? 'text-justify' : 'text-left';
  };

  const getLineHeightClass = () => {
    if (!chatSettings) return 'leading-relaxed';
    switch (chatSettings.lineHeight) {
      case 'tight': return 'leading-snug';
      case 'loose': return 'leading-loose';
      default: return 'leading-relaxed';
    }
  };

  const getTrackingClass = () => {
    if (!chatSettings) return 'tracking-normal';
    switch (chatSettings.tracking) {
      case 'tight': return 'tracking-tighter';
      case 'wide': return 'tracking-wide';
      default: return 'tracking-normal';
    }
  };

  const getAiTextColorClass = () => {
    if (!chatSettings) return 'text-neutral-100';
    switch (chatSettings.aiTextColor) {
      case 'gold': return 'text-yellow-200';
      case 'purple': return 'text-purple-200';
      case 'green': return 'text-green-200';
      default: return 'text-neutral-100';
    }
  };

  const getBorderStyleClass = () => {
    if (!chatSettings) return 'rounded-2xl';
    switch (chatSettings.borderStyle) {
      case 'sharp': return 'rounded-none';
      case 'fantasy': return 'rounded-tl-3xl rounded-br-3xl rounded-tr-md rounded-bl-md';
      default: return 'rounded-2xl';
    }
  };

  const getShadowClass = () => {
    if (!chatSettings) return 'shadow-lg';
    switch (chatSettings.shadowIntensity) {
      case 'none': return 'shadow-none';
      case 'sm': return 'shadow-sm';
      case 'lg': return 'shadow-xl';
      default: return 'shadow-lg';
    }
  };

  useEffect(() => {
    if (messages.length > lastMessageCount.current) {
      if (chatSettings?.autoScroll !== false) {
        scrollRef.current?.scrollTo({
          top: scrollRef.current.scrollHeight,
          behavior: chatSettings?.smoothScroll === false ? 'auto' : 'smooth'
        });
      }
    }
    lastMessageCount.current = messages.length;
  }, [messages.length, chatSettings?.autoScroll, chatSettings?.smoothScroll]);

  const formatTime = (timestamp: any) => {
    if (!timestamp) return '';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const getPlayerColor = (uid: string) => {
    if (chatSettings?.playerColors === false) return 'text-neutral-400';
    const colors = ['text-blue-400', 'text-green-400', 'text-yellow-400', 'text-purple-400', 'text-pink-400', 'text-indigo-400', 'text-teal-400'];
    let hash = 0;
    for (let i = 0; i < uid.length; i++) {
      hash = uid.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
  };

  const getAvatarSizeClass = () => {
    switch (chatSettings?.avatarSize) {
      case 'sm': return 'w-6 h-6 text-[10px]';
      case 'lg': return 'w-10 h-10 text-base';
      case 'md':
      default: return 'w-8 h-8 text-xs';
    }
  };

  return (
    <div 
      ref={scrollRef}
      className={cn(
        "flex-1 overflow-y-auto p-4 space-y-6",
        chatSettings?.smoothScroll !== false && "scroll-smooth",
        getFontClass(),
        getSizeClass(),
        getAlignClass(),
        getLineHeightClass(),
        getTrackingClass()
      )}
    >
      {messages.map(msg => {
        if (msg.role === 'system') {
          if (chatSettings?.hideSystemMessages) return null;
          return (
            <div key={msg.id} className="flex justify-center my-2">
              <div className="bg-orange-500/10 border border-orange-500/20 rounded-full px-4 py-2 text-xs font-medium text-orange-200/70 flex items-center gap-2 tracking-wide uppercase">
                <span className="w-1.5 h-1.5 rounded-full bg-orange-500 animate-pulse" />
                {msg.content}
              </div>
            </div>
          );
        }

        const isCompact = chatSettings?.compactMode;
        const isPlain = chatSettings?.messageStyle === 'plain';
        const showTime = chatSettings?.showTimestamps;
        const showAvatar = chatSettings?.avatarSize !== 'hidden';

        if (msg.role === 'player') {
          const isMine = msg.playerUid === currentUser?.uid;
          
          if (msg.isHidden && !isMine && !isHost) {
            return (
              <div key={msg.id} className={cn(
                "p-3 text-sm text-neutral-500 italic flex items-center gap-2",
                !isPlain && "bg-neutral-900/30 border border-neutral-800/30 rounded-xl"
              )}>
                <span>🔒</span>
                <span>{msg.playerName} сделал тайное действие</span>
              </div>
            );
          }
          return (
            <div key={msg.id} className={cn(
              isCompact ? "p-2" : "p-4",
              !isPlain && getBorderStyleClass(),
              !isPlain && getShadowClass(),
              !isPlain && (isMine ? "bg-orange-900/20 border border-orange-900/30 text-orange-100" : "bg-neutral-800/50 border border-neutral-700/50 text-neutral-200"),
              !isPlain && msg.isHidden && "border-red-500/30 bg-red-900/20",
              isPlain && "border-b border-neutral-800/50 pb-4"
            )}>
              <div className="text-xs uppercase tracking-wider mb-2 flex items-center gap-2 text-neutral-400">
                {showAvatar && (
                  <div className={cn("rounded-full bg-neutral-800 border border-neutral-700 flex items-center justify-center font-bold shrink-0", getAvatarSizeClass(), getPlayerColor(msg.playerUid || ''))}>
                    {msg.playerName?.charAt(0) || '?'}
                  </div>
                )}
                <span className={cn(chatSettings?.boldNames !== false && "font-bold", getPlayerColor(msg.playerUid || ''))}>{msg.playerName}</span>
                {msg.isHidden && <span className="text-red-400 font-bold bg-red-500/10 px-2 py-0.5 rounded flex items-center gap-1">🔒 ТАЙНОЕ ДЕЙСТВИЕ</span>}
                <span className="text-neutral-700">•</span>
                <span>Ход {msg.turn}</span>
                {showTime && (
                  <>
                    <span className="text-neutral-700">•</span>
                    <span>{formatTime(msg.createdAt)}</span>
                  </>
                )}
              </div>
              <div className={cn(
                "markdown-body",
                chatSettings?.italicActions && "italic text-neutral-300",
                chatSettings?.autoCapitalize && "first-letter:uppercase"
              )}>
                {chatSettings?.enableMarkdown === false ? (
                  <div className="whitespace-pre-wrap">{msg.content}</div>
                ) : (
                  <Markdown>{msg.content}</Markdown>
                )}
              </div>
            </div>
          );
        }
        
        return (
          <div key={msg.id} className={cn(
            isCompact ? "p-3" : "p-5",
            !isPlain && getBorderStyleClass(),
            !isPlain && getShadowClass(),
            !isPlain && (msg.role === 'ai' ? "bg-neutral-900 border border-neutral-800" : "bg-neutral-900/50 border border-neutral-800/50"),
            isPlain && "border-b border-neutral-800/50 pb-4",
            msg.role === 'ai' ? getAiTextColorClass() : "text-neutral-300"
          )}>
            <div className="text-xs font-bold uppercase tracking-[0.2em] mb-3 flex items-center gap-2 text-neutral-500 border-b border-neutral-800 pb-2">
              {showAvatar && msg.role === 'ai' && (
                <div className={cn("rounded-full bg-orange-900/30 border border-orange-500/30 flex items-center justify-center font-bold shrink-0 text-orange-500", getAvatarSizeClass())}>
                  GM
                </div>
              )}
              {msg.role === 'ai' ? 'Гейм-мастер' : 'Действия игроков'}
              <span className="text-neutral-700">•</span>
              <span>Ход {msg.turn}</span>
              {showTime && (
                <>
                  <span className="text-neutral-700">•</span>
                  <span>{formatTime(msg.createdAt)}</span>
                </>
              )}
            </div>
            {isHost && msg.reasoning && (
              <div className="mb-4 p-3 bg-neutral-950 border border-neutral-800 rounded-lg text-xs text-neutral-400 font-mono">
                <div className="font-bold text-neutral-500 mb-1">Скрытые рассуждения (только для Хоста):</div>
                <Markdown>{msg.reasoning}</Markdown>
              </div>
            )}
            <div className={cn(
              "markdown-body prose prose-invert prose-orange max-w-none",
              chatSettings?.autoCapitalize && "first-letter:uppercase"
            )}>
              {chatSettings?.enableMarkdown === false ? (
                <div className="whitespace-pre-wrap">{msg.content}</div>
              ) : (
                <Markdown>{msg.content}</Markdown>
              )}
            </div>
          </div>
        );
      })}
      
      {isGenerating && (
        <div className="rounded-xl p-4 bg-neutral-900 border border-neutral-800 text-neutral-100 flex items-center gap-3 text-sm">
          <Loader2 size={16} className="animate-spin text-orange-500" />
          <span className="text-neutral-400 animate-pulse">{typingIndicator || "Гейм-мастер думает..."}</span>
        </div>
      )}
      
      {generationError && isHost && (
        <div className="rounded-xl p-4 bg-red-900/20 border border-red-900/50 text-red-200 flex flex-col gap-3 text-sm">
          <span className="font-medium">{generationError}</span>
          <button 
            onClick={onRetryGeneration} 
            className="bg-red-600 hover:bg-red-500 text-white px-4 py-2 rounded-lg w-fit transition-colors"
          >
            Повторить попытку
          </button>
        </div>
      )}
      
      {isHost && !isGenerating && readyPlayersCount > 0 && readyPlayersCount < playersCount && (
        <div className="flex justify-center py-2">
          <button 
            onClick={onForceTurn}
            className="text-xs text-neutral-500 hover:text-orange-400 transition-colors flex items-center gap-1"
          >
            <span className="shrink-0">▶️</span>
            Форсировать ход (не все готовы)
          </button>
        </div>
      )}
      <div className="h-4 shrink-0" />
    </div>
  );
}
