import React from 'react';
import { AppSettings, Player } from '@/src/types';
import { Backpack, Package, Trash2, ArrowRightLeft, Utensils, Info } from 'lucide-react';
import { cn } from '@/src/lib/utils';

interface InventoryTabProps {
  me?: Player;
  isSpectator: boolean;
  appSettings?: AppSettings;
}

export const InventoryTab = ({ me, appSettings }: InventoryTabProps) => {
  const isLight = appSettings?.theme === 'light';

  return (
    <div className={cn(
      "flex-1 flex flex-col min-h-0 overflow-hidden",
      isLight ? "bg-neutral-50" : "bg-black"
    )}>
      <div className="p-6 border-b border-neutral-800/50 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-orange-500/10 flex items-center justify-center border border-orange-500/20">
            <Backpack className="text-orange-500" size={24} />
          </div>
          <div>
            <h3 className="text-lg font-bold font-display uppercase tracking-wider text-white">Инвентарь</h3>
            <p className="text-xs text-neutral-500 uppercase tracking-widest font-medium">Предметы и снаряжение</p>
          </div>
        </div>
        <div className="text-right">
          <span className="text-2xl font-black text-orange-500">{me?.inventory?.length || 0}</span>
          <span className="text-xs text-neutral-600 font-bold ml-1 uppercase">/ 20</span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {!me || !me.inventory || me.inventory.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center space-y-4 opacity-40">
            <div className="w-20 h-20 rounded-full bg-neutral-900 flex items-center justify-center border border-neutral-800">
              <Package size={40} className="text-neutral-600" />
            </div>
            <p className="text-neutral-500 font-medium italic">Ваш рюкзак пуст...</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3">
            {me.inventory.map((item: string, i: number) => (
              <div 
                key={i} 
                className={cn(
                  "group p-4 rounded-2xl border transition-all duration-300 flex items-center justify-between",
                  isLight 
                    ? "bg-white border-neutral-200 hover:border-orange-200 shadow-sm" 
                    : "bg-neutral-900/50 border-neutral-800 hover:border-neutral-700 hover:bg-neutral-900"
                )}
              >
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-neutral-800 flex items-center justify-center border border-neutral-700 group-hover:border-orange-500/30 transition-colors">
                    <Package size={20} className="text-neutral-400 group-hover:text-orange-500 transition-colors" />
                  </div>
                  <div>
                    <h4 className="font-bold text-neutral-200 group-hover:text-white transition-colors">{item}</h4>
                    <div className="flex items-center gap-3 mt-1">
                      <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-600">Обычный предмет</span>
                    </div>
                  </div>
                </div>
                
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button className="p-2 hover:bg-neutral-800 rounded-lg text-neutral-500 hover:text-orange-500 transition-colors" title="Использовать">
                    <Utensils size={18} />
                  </button>
                  <button className="p-2 hover:bg-neutral-800 rounded-lg text-neutral-500 hover:text-blue-500 transition-colors" title="Передать">
                    <ArrowRightLeft size={18} />
                  </button>
                  <button className="p-2 hover:bg-neutral-800 rounded-lg text-neutral-500 hover:text-red-500 transition-colors" title="Выбросить">
                    <Trash2 size={18} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      
      <div className="p-6 bg-neutral-900/30 border-t border-neutral-800/50">
        <div className="flex items-start gap-3 bg-blue-500/5 border border-blue-500/10 p-4 rounded-2xl">
          <Info className="text-blue-500 shrink-0 mt-0.5" size={18} />
          <p className="text-xs text-blue-200/60 leading-relaxed">
            Чтобы использовать, передать или выбросить предмет, введите соответствующую команду в чате (например, <code className="text-blue-400 font-mono">/drop {me?.inventory?.[0] || 'предмет'}</code>).
          </p>
        </div>
      </div>
    </div>
  );
};
