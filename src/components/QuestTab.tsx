import React from 'react';
import { ScrollText, CheckCircle2, Circle, Sparkles, Map, Flag } from 'lucide-react';
import { AppSettings } from '@/src/types';
import { cn } from '@/src/lib/utils';

interface QuestTabProps {
  quests: string[];
  appSettings?: AppSettings;
}

export default function QuestTab({ quests, appSettings }: QuestTabProps) {
  const isLight = appSettings?.theme === 'light';

  return (
    <div className={cn(
      "flex-1 flex flex-col min-h-0 overflow-hidden",
      isLight ? "bg-neutral-50" : "bg-black"
    )}>
      <div className="p-6 border-b border-neutral-800/50 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-orange-500/10 flex items-center justify-center border border-orange-500/20">
            <ScrollText className="text-orange-500" size={24} />
          </div>
          <div>
            <h3 className="text-lg font-bold font-display uppercase tracking-wider text-white">Журнал заданий</h3>
            <p className="text-xs text-neutral-500 uppercase tracking-widest font-medium">Ваши приключения</p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {(!quests || quests.length === 0) ? (
          <div className="h-full flex flex-col items-center justify-center text-center space-y-4 opacity-40">
            <div className="w-20 h-20 rounded-full bg-neutral-900 flex items-center justify-center border border-neutral-800">
              <Map size={40} className="text-neutral-600" />
            </div>
            <div>
              <p className="text-neutral-500 font-medium italic">Активных заданий пока нет.</p>
              <p className="text-xs text-neutral-600 mt-1 uppercase tracking-widest">Исследуйте мир, чтобы найти приключения</p>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {quests.map((quest, index) => {
              const isCompleted = quest.toLowerCase().includes('[выполнено]') || quest.toLowerCase().includes('[завершено]');
              const cleanQuest = quest.replace(/\[выполнено\]|\[завершено\]/gi, '').trim();
              
              return (
                <div 
                  key={index} 
                  className={cn(
                    "group p-5 rounded-2xl border transition-all duration-300",
                    isCompleted 
                      ? (isLight ? "bg-neutral-100 border-neutral-200" : "bg-neutral-900/30 border-neutral-800/50 opacity-60") 
                      : (isLight ? "bg-white border-orange-500/20 shadow-sm" : "bg-neutral-900/50 border-orange-500/20 hover:border-orange-500/40")
                  )}
                >
                  <div className="flex items-start gap-4">
                    <div className={cn(
                      "w-10 h-10 rounded-xl flex items-center justify-center border shrink-0 transition-colors",
                      isCompleted 
                        ? "bg-green-500/10 border-green-500/20 text-green-500" 
                        : "bg-orange-500/10 border-orange-500/20 text-orange-500 group-hover:border-orange-500/40"
                    )}>
                      {isCompleted ? <CheckCircle2 size={20} /> : <Flag size={20} />}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-1">
                        <span className={cn(
                          "text-[10px] font-black uppercase tracking-[0.2em]",
                          isCompleted ? "text-green-500/50" : "text-orange-500/70"
                        )}>
                          {isCompleted ? 'Завершено' : 'Активно'}
                        </span>
                        {!isCompleted && <Sparkles size={12} className="text-orange-500/40 animate-pulse" />}
                      </div>
                      <p className={cn(
                        "text-base leading-relaxed",
                        isCompleted ? "text-neutral-500 line-through" : "text-neutral-200 font-medium"
                      )}>
                        {cleanQuest}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
