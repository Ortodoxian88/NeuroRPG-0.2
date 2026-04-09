import React from 'react';
import { Backpack } from 'lucide-react';
import { Player, AppSettings } from '../../types';
import { cn } from '../../lib/utils';

interface InventoryTabProps {
  me: Player | undefined;
  isSpectator: boolean;
  appSettings?: AppSettings;
}

export default function InventoryTab({ me, isSpectator, appSettings }: InventoryTabProps) {
  return (
    <div className={cn(
      "flex-1 overflow-y-auto p-4 space-y-4",
      appSettings?.theme === 'light' ? "bg-neutral-50" : "bg-black"
    )}>
      <h2 className={cn(
        "text-xl font-bold flex items-center gap-2 mb-6 font-display",
        appSettings?.theme === 'light' ? "text-neutral-900" : "text-white"
      )}>
        <Backpack className="text-orange-500" /> Инвентарь
      </h2>
      {isSpectator ? (
        <p className="text-neutral-500 text-center py-8">Вы наблюдатель. У вас нет инвентаря.</p>
      ) : me?.inventory.length === 0 ? (
        <p className="text-neutral-500 text-center py-8">Ваши карманы пусты.</p>
      ) : (
        <ul className="space-y-3">
          {me?.inventory.map((item, i) => (
            <li key={i} className={cn(
              "border p-4 rounded-xl flex items-center gap-3 text-base transition-all",
              appSettings?.theme === 'light' ? "bg-white border-neutral-200 text-neutral-800 shadow-sm" : "bg-neutral-900 border-neutral-800 text-neutral-200"
            )}>
              <div className="w-2 h-2 rounded-full bg-orange-500/50 shrink-0" />
              {item}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
