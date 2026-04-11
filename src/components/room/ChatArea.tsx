import React, { useEffect, useRef } from 'react';
import { Message, ChatSettings, AppSettings, Player } from '@/src/types';
import { Loader2 } from 'lucide-react';
import Markdown from 'react-markdown';
import { cn } from '@/src/lib/utils';

interface ChatAreaProps {
  messages: Message[];
  currentUser: any;
  isGenerating: boolean;
  typingIndicator: string;
  generationError: string | null;
  isHost: boolean;
  onRetryGeneration: () => void;
  onForceTurn: () => void;
  playersCount: number;
  readyPlayersCount: number;
  players?: Player[];
  typedMessageIds: Set<string>;
  onMessageTyped: (id: string) => void;
  chatSettings?: ChatSettings;
  appSettings?: AppSettings;
}

const TypewriterContent = ({ content, speed, onComplete }: { content: string, speed: number, onComplete?: () => void }) => {
  const [displayedContent, setDisplayedContent] = React.useState('');
  const [isComplete, setIsComplete] = React.useState(false);

  React.useEffect(() => {
    if (speed === 0) {
      setDisplayedContent(content);
      setIsComplete(true);
      onComplete?.();
      return;
    }

    let i = 0;
    const timer = setInterval(() => {
      setDisplayedContent(content.slice(0, i + 1));
      i++;
      if (i >= content.length) {
        clearInterval(timer);
        setIsComplete(true);
        onComplete?.();
      }
    }, speed);

    return () => clearInterval(timer);
  }, [content, speed]);

  return (
    <div className="whitespace-pre-wrap">
      <Markdown>{displayedContent}</Markdown>
    </div>
  );
};

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
  players = [],
  typedMessageIds,
  onMessageTyped,
  chatSettings,
  appSettings
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
    if (!chatSettings) return appSettings?.theme === 'light' ? 'text-neutral-900' : 'text-neutral-100';
    switch (chatSettings.aiTextColor) {
      case 'gold': return 'text-yellow-600 dark:text-yellow-200';
      case 'purple': return 'text-purple-600 dark:text-purple-200';
      case 'green': return 'text-green-600 dark:text-green-200';
      default: return appSettings?.theme === 'light' ? 'text-neutral-900' : 'text-neutral-100';
    }
  };
  
  const highlightContent = (content: string) => {
    if (!chatSettings?.highlightKeywords) return content;
    // Simple keyword highlighting (loot, locations, items)
    const keywords = ['золото', 'меч', 'зелье', 'пещера', 'замок', 'ключ', 'алтарь', 'сундук'];
    let highlighted = content;
    keywords.forEach(kw => {
      const regex = new RegExp(`(${kw})`, 'gi');
      highlighted = highlighted.replace(regex, '<span class="text-orange-500 font-bold">$1</span>');
    });
    return highlighted;
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
    if (!chatSettings) return appSettings?.theme === 'light' ? 'shadow-sm' : 'shadow-lg';
    switch (chatSettings.shadowIntensity) {
      case 'none': return 'shadow-none';
      case 'sm': return 'shadow-sm';
      case 'lg': return 'shadow-xl';
      default: return appSettings?.theme === 'light' ? 'shadow-sm' : 'shadow-lg';
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
    if (chatSettings?.playerColors === false) return 'text-neutral-500';
    const colors = ['text-blue-500', 'text-green-500', 'text-yellow-600', 'text-purple-500', 'text-pink-500', 'text-indigo-500', 'text-teal-500'];
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
        getTrackingClass(),
        appSettings?.theme === 'light' ? "bg-neutral-50" : "bg-black"
      )}
    >
      {messages.map(msg => {
        if (msg.role === 'system') {
          if (chatSettings?.hideSystemMessages) return null;
          return (
            <div key={msg.id} className="flex justify-center my-2">
              <div className={cn(
                "border rounded-full px-4 py-2 text-xs font-medium flex items-center gap-2 tracking-wide uppercase",
                appSettings?.theme === 'light' ? "bg-orange-50 border-orange-100 text-orange-600" : "bg-orange-500/10 border border-orange-500/20 text-orange-200/70"
              )}>
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
          const isMine = msg.playerUid === currentUser?.id;
          const isLast = messages[messages.length - 1]?.id === msg.id;
          const isFocused = !chatSettings?.focusMode || isLast;
          
          if (msg.isHidden && !isMine && !isHost) {
            return (
              <div key={msg.id} className={cn(
                "p-3 text-sm italic flex items-center gap-2 transition-opacity duration-500",
                appSettings?.theme === 'light' ? "text-neutral-400" : "text-neutral-500",
                !isPlain && (appSettings?.theme === 'light' ? "bg-white border border-neutral-200 rounded-xl shadow-sm" : "bg-neutral-900/30 border border-neutral-800/30 rounded-xl"),
                !isFocused && "opacity-30 grayscale"
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
              !isPlain && (
                isMine 
                  ? (appSettings?.theme === 'light' ? "bg-orange-50 border border-orange-100 text-neutral-900" : "bg-orange-900/20 border border-orange-900/30 text-orange-100") 
                  : (appSettings?.theme === 'light' ? "bg-white border border-neutral-200 text-neutral-900" : "bg-neutral-800/50 border border-neutral-700/50 text-neutral-200")
              ),
              !isPlain && msg.isHidden && "border-red-500/30 bg-red-900/20",
              isPlain && (appSettings?.theme === 'light' ? "border-b border-neutral-200 pb-4" : "border-b border-neutral-800/50 pb-4"),
              "transition-opacity duration-500",
              !isFocused && "opacity-30 grayscale"
            )}>
              <div className={cn(
                "text-xs uppercase tracking-wider mb-2 flex items-center gap-2",
                appSettings?.theme === 'light' ? "text-neutral-500" : "text-neutral-400"
              )}>
                {showAvatar && (
                  <div className={cn("rounded-full flex items-center justify-center font-bold shrink-0 border", getAvatarSizeClass(), getPlayerColor(msg.playerUid || ''), appSettings?.theme === 'light' ? "bg-neutral-50 border-neutral-200" : "bg-neutral-800 border-neutral-700")}>
                    {msg.playerName?.charAt(0) || '?'}
                  </div>
                )}
                <span className={cn(chatSettings?.boldNames !== false && "font-bold", getPlayerColor(msg.playerUid || ''))}>{msg.playerName}</span>
                {msg.isHidden && <span className="text-red-500 font-bold bg-red-500/10 px-2 py-0.5 rounded flex items-center gap-1">🔒 ТАЙНОЕ ДЕЙСТВИЕ</span>}
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
                chatSettings?.italicActions && "italic",
                appSettings?.theme === 'light' ? "text-neutral-600" : "text-neutral-300",
                chatSettings?.autoCapitalize && "first-letter:uppercase"
              )}>
                {chatSettings?.enableMarkdown === false ? (
                  <div className="whitespace-pre-wrap" dangerouslySetInnerHTML={{ __html: highlightContent(msg.content) }} />
                ) : (
                  <Markdown>{msg.content}</Markdown>
                )}
              </div>
            </div>
          );
        }
        
        const isLast = messages[messages.length - 1]?.id === msg.id;
        const isFocused = !chatSettings?.focusMode || isLast;

        return (
          <div key={msg.id} className={cn(
            isCompact ? "p-3" : "p-5",
            !isPlain && getBorderStyleClass(),
            !isPlain && getShadowClass(),
            !isPlain && (
              msg.role === 'ai' 
                ? (appSettings?.theme === 'light' ? "bg-white border border-neutral-200" : "bg-neutral-900 border border-neutral-800") 
                : (appSettings?.theme === 'light' ? "bg-neutral-100/50 border border-neutral-200" : "bg-neutral-900/50 border border-neutral-800/50")
            ),
            isPlain && (appSettings?.theme === 'light' ? "border-b border-neutral-200 pb-4" : "border-b border-neutral-800/50 pb-4"),
            msg.role === 'ai' ? getAiTextColorClass() : (appSettings?.theme === 'light' ? "text-neutral-700" : "text-neutral-300"),
            "transition-opacity duration-500",
            !isFocused && "opacity-30 grayscale"
          )}>
            <div className={cn(
              "text-xs font-bold uppercase tracking-[0.2em] mb-3 flex items-center gap-2 border-b pb-2",
              appSettings?.theme === 'light' ? "text-neutral-400 border-neutral-100" : "text-neutral-500 border-neutral-800"
            )}>
              {showAvatar && msg.role === 'ai' && (
                <div className={cn("rounded-full flex items-center justify-center font-bold shrink-0 border", getAvatarSizeClass(), appSettings?.theme === 'light' ? "bg-orange-50 border-orange-200 text-orange-600" : "bg-orange-900/30 border border-orange-500/30 text-orange-500")}>
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
              <div className={cn(
                "mb-4 p-3 border rounded-lg text-xs font-mono",
                appSettings?.theme === 'light' ? "bg-neutral-50 border-neutral-200 text-neutral-500" : "bg-neutral-950 border border-neutral-800 text-neutral-400"
              )}>
                <div className="font-bold text-neutral-500 mb-1">Скрытые рассуждения (только для Хоста):</div>
                <Markdown>{msg.reasoning}</Markdown>
              </div>
            )}
            <div className={cn(
              "markdown-body prose prose-orange max-w-none",
              appSettings?.theme === 'light' ? "prose-neutral" : "prose-invert",
              chatSettings?.autoCapitalize && "first-letter:uppercase"
            )}>
              {isLast && msg.role === 'ai' && chatSettings?.typewriterSpeed && chatSettings.typewriterSpeed > 0 && !typedMessageIds.has(msg.id) ? (
                <TypewriterContent 
                  content={msg.content} 
                  speed={chatSettings.typewriterSpeed} 
                  onComplete={() => onMessageTyped(msg.id)}
                />
              ) : chatSettings?.enableMarkdown === false ? (
                <div className="whitespace-pre-wrap" dangerouslySetInnerHTML={{ __html: highlightContent(msg.content) }} />
              ) : (
                <Markdown>{msg.content}</Markdown>
              )}
            </div>
          </div>
        );
      })}
      
      {isGenerating && (
        <div className={cn(
          "rounded-xl p-4 border flex items-center gap-3 text-sm",
          appSettings?.theme === 'light' ? "bg-white border-neutral-200 text-neutral-900 shadow-sm" : "bg-neutral-900 border border-neutral-800 text-neutral-100"
        )}>
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
        <div className="flex flex-col items-center gap-2 py-2">
          <div className="flex flex-wrap justify-center gap-2 mb-2">
            {players.map(p => (
              <div 
                key={p.uid} 
                className={cn(
                  "px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider border transition-all",
                  p.isReady 
                    ? "bg-green-500/20 border-green-500/30 text-green-400" 
                    : "bg-neutral-500/10 border-neutral-500/20 text-neutral-500"
                )}
              >
                {p.name} {p.isReady ? '✓' : '...'}
              </div>
            ))}
          </div>
          <button 
            onClick={onForceTurn}
            className="text-xs text-neutral-500 hover:text-orange-400 transition-colors flex items-center gap-1 bg-neutral-900/50 px-3 py-1.5 rounded-full border border-neutral-800"
          >
            <span className="shrink-0">▶️</span>
            Форсировать ход ({readyPlayersCount}/{playersCount} готовы)
          </button>
        </div>
      )}
      <div className="h-4 shrink-0" />
    </div>
  );
}
