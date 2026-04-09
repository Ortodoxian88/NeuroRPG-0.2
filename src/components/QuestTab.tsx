import React from 'react';
import { ScrollText, CheckCircle2, Circle } from 'lucide-react';
import { AppSettings } from '../types';
import { cn } from '../lib/utils';

interface QuestTabProps {
  quests: string[];
  appSettings?: AppSettings;
}

export default function QuestTab({ quests, appSettings }: QuestTabProps) {
  const isLight = appSettings?.theme === 'light';

  return (
    <div className={cn(
      "flex-1 overflow-y-auto p-4",
      isLight ? "bg-neutral-50" : "bg-black"
    )}>
      <h2 className={cn(
        "text-xl font-bold mb-6 flex items-center gap-2 font-display",
        isLight ? "text-neutral-900" : "text-white"
      )}>
        <ScrollText className="text-orange-500" />
        Журнал заданий
      </h2>
      
      {(!quests || quests.length === 0) ? (
        <div className="text-center text-neutral-500 py-10">
          <ScrollText size={48} className="mx-auto mb-4 opacity-20" />
          <p>Активных заданий пока нет.</p>
          <p className="text-sm mt-2">Исследуйте мир, чтобы найти приключения.</p>
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
                  "p-4 rounded-xl border transition-all",
                  isCompleted 
                    ? (isLight ? "bg-neutral-100 border-neutral-200" : "bg-neutral-900/50 border-neutral-800") 
                    : (isLight ? "bg-white border-orange-500/30 shadow-sm" : "bg-neutral-900 border-orange-500/30")
                )}
              >
                <div className="flex items-start gap-3">
                  {isCompleted ? (
                    <CheckCircle2 className="text-green-500 shrink-0 mt-0.5" size={20} />
                  ) : (
                    <Circle className="text-orange-500 shrink-0 mt-0.5" size={20} />
                  )}
                  <p className={cn(
                    "text-base",
                    isCompleted ? "text-neutral-500 line-through" : (isLight ? "text-neutral-800" : "text-neutral-200")
                  )}>
                    {cleanQuest}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
