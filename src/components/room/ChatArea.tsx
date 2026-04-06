import React, { useEffect, useRef } from 'react';
import { Message } from '@/src/types';
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
  readyPlayersCount
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

  return (
    <div 
      ref={scrollRef}
      className="flex-1 overflow-y-auto p-4 space-y-6 scroll-smooth"
    >
      {messages.map(msg => {
        if (msg.role === 'system') {
          return (
            <div key={msg.id} className="flex justify-center my-2">
              <div className="bg-orange-500/10 border border-orange-500/20 rounded-full px-4 py-1.5 text-[11px] font-medium text-orange-200/70 flex items-center gap-2 tracking-wide uppercase">
                <span className="w-1 h-1 rounded-full bg-orange-500 animate-pulse" />
                {msg.content}
              </div>
            </div>
          );
        }

        if (msg.role === 'player') {
          const isMine = msg.playerUid === currentUser?.uid;
          
          if (msg.isHidden && !isMine && !isHost) {
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
            "rounded-2xl p-5 text-sm shadow-lg",
            msg.role === 'ai' ? "bg-neutral-900 border border-neutral-800 text-neutral-100 leading-relaxed font-serif" :
            "bg-neutral-900/50 border border-neutral-800/50 text-neutral-300"
          )}>
            <div className="text-[10px] font-bold uppercase tracking-[0.2em] mb-3 flex items-center gap-2 text-neutral-500 border-b border-neutral-800 pb-2">
              {msg.role === 'ai' ? 'Гейм-мастер' : 'Действия игроков'}
              <span className="text-neutral-700">•</span>
              <span>Ход {msg.turn}</span>
            </div>
            {isHost && msg.reasoning && (
              <div className="mb-4 p-3 bg-neutral-950 border border-neutral-800 rounded-lg text-xs text-neutral-400 font-mono">
                <div className="font-bold text-neutral-500 mb-1">Скрытые рассуждения (только для Хоста):</div>
                <Markdown>{msg.reasoning}</Markdown>
              </div>
            )}
            <div className="markdown-body text-[15px] leading-relaxed prose prose-invert prose-orange max-w-none">
              <Markdown>{msg.content}</Markdown>
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
