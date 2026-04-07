import React from 'react';
import { Send, Mic, Loader2 } from 'lucide-react';
import { cn } from '@/src/lib/utils';
import { Player } from '@/src/types';

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
  onVoiceInput
}: ActionInputProps) {
  if (isSpectator) {
    return (
      <div className="shrink-0 p-3 bg-neutral-900 border-t border-neutral-800 text-center text-neutral-500 py-3 text-sm">
        Вы находитесь в режиме наблюдателя.
      </div>
    );
  }

  if (me?.isReady) {
    return (
      <div className="shrink-0 p-3 bg-neutral-900 border-t border-neutral-800">
        <div className="bg-neutral-800 border border-neutral-700 rounded-lg p-3 text-sm flex items-center justify-between">
          <div className="flex items-center gap-3 text-neutral-400 overflow-hidden">
            <Loader2 size={16} className="animate-spin shrink-0" />
            <span className="truncate">{me.action}</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="shrink-0 p-3 bg-neutral-900 border-t border-neutral-800 relative">
      {showCommands && (
        <div className="absolute bottom-full left-0 right-0 mb-2 bg-neutral-900 border border-neutral-800 rounded-xl shadow-xl overflow-hidden max-h-48 overflow-y-auto z-50">
          {filteredCommands.length > 0 ? (
            filteredCommands.map((c, i) => (
              <button
                key={i}
                onClick={() => onCommandSelect(c.cmd)}
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
      <form onSubmit={onSubmit} className="flex gap-3">
        <div className="relative flex-1">
          <input
            type="text"
            value={actionInput}
            onChange={onInputChange}
            placeholder={`Что делает ${me?.name}? (введите / для команд)`}
            className="w-full bg-black border border-neutral-700 rounded-full py-4 pl-5 pr-14 text-base text-neutral-100 focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500 outline-none"
            disabled={isSubmittingAction || isGenerating}
          />
          <button
            type="button"
            onClick={onVoiceInput}
            className={cn(
              "absolute right-2 top-1.5 bottom-1.5 aspect-square flex items-center justify-center rounded-full transition-colors",
              isRecording ? "text-red-500 bg-red-500/10 animate-pulse" : "text-neutral-400 hover:text-white"
            )}
            disabled={isSubmittingAction || isGenerating}
          >
            <Mic size={24} />
          </button>
        </div>
        <button
          type="submit"
          disabled={!actionInput.trim() || isSubmittingAction || isGenerating}
          className="w-14 h-14 shrink-0 flex items-center justify-center bg-orange-600 hover:bg-orange-500 text-white rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Send size={24} />
        </button>
      </form>
    </div>
  );
}
