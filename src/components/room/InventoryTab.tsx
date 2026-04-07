import React from 'react';
import { Backpack } from 'lucide-react';
import { Player } from '@/src/types';

interface InventoryTabProps {
  me: Player | undefined;
  isSpectator: boolean;
}

export default function InventoryTab({ me, isSpectator }: InventoryTabProps) {
  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4">
      <h2 className="text-xl font-bold text-white flex items-center gap-2 mb-6 font-display">
        <Backpack className="text-orange-500" /> Инвентарь
      </h2>
      {isSpectator ? (
        <p className="text-neutral-500 text-center py-8">Вы наблюдатель. У вас нет инвентаря.</p>
      ) : me?.inventory.length === 0 ? (
        <p className="text-neutral-500 text-center py-8">Ваши карманы пусты.</p>
      ) : (
        <ul className="space-y-3">
          {me?.inventory.map((item, i) => (
            <li key={i} className="bg-neutral-900 border border-neutral-800 p-4 rounded-xl text-neutral-200 flex items-center gap-3 text-base">
              <div className="w-2 h-2 rounded-full bg-orange-500/50 shrink-0" />
              {item}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
