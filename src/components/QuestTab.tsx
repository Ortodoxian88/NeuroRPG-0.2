import React from 'react';
import { ScrollText, CheckCircle2, Circle } from 'lucide-react';

interface QuestTabProps {
  quests: string[];
}

export default function QuestTab({ quests }: QuestTabProps) {
  return (
    <div className="flex-1 overflow-y-auto p-4 bg-black">
      <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-2 font-display">
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
                className={`p-4 rounded-xl border ${isCompleted ? 'bg-neutral-900/50 border-neutral-800' : 'bg-neutral-900 border-orange-500/30'}`}
              >
                <div className="flex items-start gap-3">
                  {isCompleted ? (
                    <CheckCircle2 className="text-green-500 shrink-0 mt-0.5" size={20} />
                  ) : (
                    <Circle className="text-orange-500 shrink-0 mt-0.5" size={20} />
                  )}
                  <p className={`text-base ${isCompleted ? 'text-neutral-500 line-through' : 'text-neutral-200'}`}>
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
