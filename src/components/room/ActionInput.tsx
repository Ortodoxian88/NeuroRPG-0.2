import React from 'react';
import { Send, Mic, Loader2 } from 'lucide-react';
import { cn } from '../../lib/utils';
import { Player, AppSettings } from '../../types';

interface ActionInputProps {
  me: Player | undefined;
  isSpectator: boolean;
  isGenerating: boolean;
  actionInput: string;
  isSubmittingAction: boolean;
  showCommands: boolean;
  filteredCommands: { cmd: string; desc: string }[];
  isRecording: boolean;
  onInputChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onCommandSelect: (cmd: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  onVoiceInput: () => void;
  appSettings?: AppSettings;
}

export default function ActionInput({
  me,
  isSpectator,
  isGenerating,
  actionInput,
  isSubmittingAction,
  showCommands,
  filteredCommands,
  isRecording,
  onInputChange,
  onCommandSelect,
  onSubmit,
  onVoiceInput,
  appSettings
}: ActionInputProps) {
  if (isSpectator) {
    return (
      <div className={cn(
        "shrink-0 p-3 border-t text-center py-3 text-sm",
        appSettings?.theme === 'light' ? "bg-white border-neutral-200 text-neutral-500" : "bg-neutral-900 border-neutral-800 text-neutral-500"
      )}>
        Вы находитесь в режиме наблюдателя.
      </div>
    );
  }

  if (me?.isReady) {
    return (
      <div className={cn(
        "shrink-0 p-3 border-t",
        appSettings?.theme === 'light' ? "bg-white border-neutral-200" : "bg-neutral-900 border-neutral-800"
      )}>
        <div className={cn(
          "border rounded-2xl p-4 text-sm flex items-center justify-between",
          appSettings?.theme === 'light' ? "bg-neutral-50 border-neutral-200" : "bg-neutral-800 border-neutral-700"
        )}>
          <div className="flex items-center gap-3 text-neutral-400 overflow-hidden">
            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse shrink-0" />
            <span className="truncate italic">Вы готовы. Ожидание других игроков...</span>
          </div>
          <div className="text-[10px] font-bold uppercase tracking-widest text-neutral-500 bg-neutral-900/50 px-2 py-1 rounded border border-neutral-700">
            {me.action.length > 20 ? me.action.substring(0, 20) + '...' : me.action}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={cn(
      "shrink-0 p-3 border-t relative",
      appSettings?.theme === 'light' ? "bg-white border-neutral-200" : "bg-neutral-900 border-neutral-800"
    )}>
      {showCommands && (
        <div className={cn(
          "absolute bottom-full left-0 right-0 mb-2 border rounded-xl shadow-xl overflow-hidden max-h-48 overflow-y-auto z-50",
          appSettings?.theme === 'light' ? "bg-white border-neutral-200" : "bg-neutral-900 border-neutral-800"
        )}>
          {filteredCommands.length > 0 ? (
            filteredCommands.map((c, i) => (
              <button
                key={i}
                onClick={() => onCommandSelect(c.cmd)}
                className={cn(
                  "w-full text-left px-4 py-3 transition-colors flex flex-col gap-1 border-b last:border-0",
                  appSettings?.theme === 'light' ? "hover:bg-neutral-50 border-neutral-100" : "hover:bg-neutral-800 border-neutral-800/50"
                )}
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
      <form onSubmit={onSubmit} className="flex gap-3">
        <div className="relative flex-1">
          <input
            type="text"
            value={actionInput}
            onChange={onInputChange}
            placeholder={`Что делает ${me?.name}? (введите / для команд)`}
            className={cn(
              "w-full border rounded-full py-4 pl-5 pr-14 text-base focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500 outline-none transition-all",
              appSettings?.theme === 'light' ? "bg-neutral-50 border-neutral-200 text-neutral-900" : "bg-black border border-neutral-700 text-neutral-100"
            )}
            disabled={isSubmittingAction || isGenerating}
          />
          <button
            type="button"
            onClick={onVoiceInput}
            className={cn(
              "absolute right-2 top-1.5 bottom-1.5 aspect-square flex items-center justify-center rounded-full transition-colors",
              isRecording ? "text-red-500 bg-red-500/10 animate-pulse" : "text-neutral-400 hover:text-orange-500"
            )}
            disabled={isSubmittingAction || isGenerating}
          >
            <Mic size={24} />
          </button>
        </div>
        <button
          type="submit"
          disabled={!actionInput.trim() || isSubmittingAction || isGenerating}
          className="w-14 h-14 shrink-0 flex items-center justify-center bg-orange-600 hover:bg-orange-500 text-white rounded-full transition-all active:scale-90 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-orange-600/20"
        >
          {isSubmittingAction ? (
            <Loader2 size={24} className="animate-spin" />
          ) : (
            <Send size={24} />
          )}
        </button>
      </form>
    </div>
  );
}
