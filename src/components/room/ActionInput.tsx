import React from 'react';
import { AppSettings, Player } from '@/src/types';
import { Mic, Send, Zap, Shield, Sword, Brain, Eye, Sparkles, Command } from 'lucide-react';
import { cn } from '@/src/lib/utils';

interface ActionInputProps {
  me?: Player;
  isSpectator: boolean;
  isGenerating: boolean;
  actionInput: string;
  isSubmittingAction: boolean;
  showCommands: boolean;
  filteredCommands: { cmd: string; desc: string; }[];
  isRecording: boolean;
  onInputChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onCommandSelect: (cmd: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  onVoiceInput: () => void;
  appSettings?: AppSettings;
}

export const ActionInput = ({ 
  onInputChange, 
  actionInput, 
  onSubmit, 
  onVoiceInput, 
  isGenerating, 
  isSubmittingAction,
  showCommands,
  filteredCommands,
  onCommandSelect,
  isRecording,
  me,
  isSpectator,
  appSettings
}: ActionInputProps) => {
  const isLight = appSettings?.theme === 'light';

  if (isGenerating) return (
    <div className="p-4 bg-neutral-900/50 border-t border-neutral-800 flex items-center justify-center gap-3">
      <div className="flex gap-1">
        <div className="w-1.5 h-1.5 bg-orange-500 rounded-full animate-bounce [animation-delay:-0.3s]" />
        <div className="w-1.5 h-1.5 bg-orange-500 rounded-full animate-bounce [animation-delay:-0.15s]" />
        <div className="w-1.5 h-1.5 bg-orange-500 rounded-full animate-bounce" />
      </div>
      <span className="text-xs font-bold uppercase tracking-widest text-neutral-500">Гейм-мастер описывает мир...</span>
    </div>
  );

  if (isSpectator) return (
    <div className="p-4 bg-neutral-900/50 border-t border-neutral-800 text-center">
      <p className="text-xs font-bold uppercase tracking-widest text-neutral-600">Вы наблюдаете за игрой</p>
    </div>
  );

  return (
    <div className={cn(
      "shrink-0 border-t relative z-30",
      isLight ? "bg-white border-neutral-200" : "bg-neutral-900 border-neutral-800"
    )}>
      {/* Command Suggestions */}
      {showCommands && filteredCommands.length > 0 && (
        <div className={cn(
          "absolute bottom-full left-0 right-0 border-t animate-in slide-in-from-bottom-2 duration-200",
          isLight ? "bg-white border-neutral-200" : "bg-neutral-900 border-neutral-800"
        )}>
          <div className="max-h-48 overflow-y-auto p-2 space-y-1">
            {filteredCommands.map((c) => (
              <button
                key={c.cmd}
                onClick={() => onCommandSelect(c.cmd)}
                className={cn(
                  "w-full flex items-center justify-between p-3 rounded-xl transition-colors text-left group",
                  isLight ? "hover:bg-neutral-100" : "hover:bg-neutral-800"
                )}
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-orange-500/10 flex items-center justify-center border border-orange-500/20">
                    <Command size={14} className="text-orange-500" />
                  </div>
                  <span className="font-mono text-sm font-bold text-orange-500">{c.cmd}</span>
                </div>
                <span className="text-xs text-neutral-500 group-hover:text-neutral-300 transition-colors">{c.desc}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <form onSubmit={onSubmit} className="p-4 flex items-center gap-3 max-w-4xl mx-auto">
        <div className="relative flex-1 group">
          <input 
            className={cn(
              "w-full pl-4 pr-12 py-4 rounded-2xl border transition-all outline-none text-base font-medium",
              isLight 
                ? "bg-neutral-100 border-neutral-200 focus:bg-white focus:border-orange-500 focus:ring-4 focus:ring-orange-500/10 text-neutral-900" 
                : "bg-black border-neutral-800 focus:border-orange-500 focus:ring-4 focus:ring-orange-500/10 text-white placeholder:text-neutral-600"
            )}
            value={actionInput}
            onChange={onInputChange}
            placeholder={me?.isReady ? "Ожидание хода ИИ..." : "Что вы делаете? (напр. /roll)"}
            disabled={me?.isReady || isSubmittingAction}
          />
          <button 
            type="button" 
            onClick={onVoiceInput}
            className={cn(
              "absolute right-3 top-1/2 -translate-y-1/2 p-2 rounded-xl transition-all",
              isRecording ? "text-red-500 bg-red-500/10 animate-pulse" : "text-neutral-500 hover:text-orange-500 hover:bg-orange-500/10"
            )}
            title="Голосовой ввод"
          >
            <Mic size={20} />
          </button>
        </div>

        <button 
          type="submit" 
          disabled={isSubmittingAction || !actionInput.trim() || me?.isReady}
          className={cn(
            "h-[58px] px-6 rounded-2xl font-bold flex items-center justify-center gap-2 transition-all active:scale-95 disabled:opacity-50 disabled:grayscale disabled:scale-100 shadow-xl",
            isSubmittingAction || !actionInput.trim() || me?.isReady
              ? "bg-neutral-800 text-neutral-500"
              : "bg-orange-600 hover:bg-orange-500 text-white shadow-orange-600/20"
          )}
        >
          {isSubmittingAction ? (
            <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          ) : (
            <>
              <span className="hidden sm:inline">Отправить</span>
              <Send size={20} />
            </>
          )}
        </button>
      </form>
    </div>
  );
};
