import React from 'react';
import { AppSettings, Player } from '@/src/types';
import { cn } from '@/src/lib/utils';
import { Heart, Zap, Shield, Sword, Brain, Eye, User, Activity, AlertCircle, Sparkles } from 'lucide-react';

interface StateTabProps {
  me?: Player;
  appSettings?: AppSettings;
}

const ProgressBar = ({ current, max, color, label, icon: Icon }: { current: number, max: number, color: string, label: string, icon: any }) => {
  const percentage = Math.min(100, Math.max(0, (current / max) * 100));
  return (
    <div className="space-y-2">
      <div className="flex justify-between items-end">
        <div className="flex items-center gap-2">
          <Icon size={14} className="text-neutral-500" />
          <span className="text-[10px] font-black uppercase tracking-[0.2em] text-neutral-500">{label}</span>
        </div>
        <div className="flex items-baseline gap-1">
          <span className="text-sm font-black text-white">{current}</span>
          <span className="text-[10px] font-bold text-neutral-600">/ {max}</span>
        </div>
      </div>
      <div className="h-2.5 w-full bg-neutral-900 rounded-full overflow-hidden border border-neutral-800/50 p-0.5">
        <div 
          className={cn("h-full rounded-full transition-all duration-700 ease-out shadow-[0_0_10px_rgba(0,0,0,0.5)]", color)} 
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
};

const StatItem = ({ label, value, icon: Icon }: { label: string, value: number, icon: any }) => (
  <div className="bg-neutral-900/40 border border-neutral-800/50 p-3 rounded-xl flex flex-col items-center justify-center space-y-1 hover:border-neutral-700 transition-colors group">
    <Icon size={16} className="text-neutral-600 group-hover:text-orange-500 transition-colors" />
    <span className="text-[9px] font-bold uppercase tracking-widest text-neutral-500 text-center">{label}</span>
    <span className="text-lg font-black text-white">{value}</span>
  </div>
);

export const StateTab = ({ me, appSettings }: StateTabProps) => {
  const isLight = appSettings?.theme === 'light';

  return (
    <div className={cn(
      "flex-1 flex flex-col min-h-0 overflow-hidden",
      isLight ? "bg-neutral-50" : "bg-black"
    )}>
      <div className="p-6 border-b border-neutral-800/50 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center border border-blue-500/20">
            <Activity className="text-blue-500" size={24} />
          </div>
          <div>
            <h3 className="text-lg font-bold font-display uppercase tracking-wider text-white">Состояние</h3>
            <p className="text-xs text-neutral-500 uppercase tracking-widest font-medium">Характеристики и эффекты</p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-8">
        {!me ? (
          <div className="h-full flex flex-col items-center justify-center text-center space-y-4 opacity-40">
            <div className="w-20 h-20 rounded-full bg-neutral-900 flex items-center justify-center border border-neutral-800">
              <User size={40} className="text-neutral-600" />
            </div>
            <p className="text-neutral-500 font-medium italic">Данные персонажа не найдены...</p>
          </div>
        ) : (
          <>
            {/* Main Bars */}
            <div className="space-y-5 bg-neutral-900/20 p-5 rounded-2xl border border-neutral-800/30">
              <ProgressBar 
                current={me.hp} 
                max={me.maxHp} 
                color="bg-gradient-to-r from-red-600 to-red-400 shadow-[0_0_15px_rgba(220,38,38,0.3)]" 
                label="Здоровье (HP)" 
                icon={Heart}
              />
              <ProgressBar 
                current={me.mana} 
                max={me.maxMana} 
                color="bg-gradient-to-r from-blue-600 to-blue-400 shadow-[0_0_15px_rgba(37,99,235,0.3)]" 
                label="Мана (MP)" 
                icon={Zap}
              />
              <ProgressBar 
                current={me.stress || 0} 
                max={100} 
                color="bg-gradient-to-r from-purple-600 to-purple-400 shadow-[0_0_15px_rgba(147,51,234,0.3)]" 
                label="Стресс" 
                icon={AlertCircle}
              />
            </div>

            {/* Stats Grid */}
            <div className="space-y-4">
              <h4 className="text-[10px] font-black uppercase tracking-[0.3em] text-neutral-600 ml-1">Характеристики</h4>
              <div className="grid grid-cols-3 gap-3">
                <StatItem label="СИЛ" value={me.statStrength || 10} icon={Sword} />
                <StatItem label="ЛОВ" value={me.statDexterity || 10} icon={Zap} />
                <StatItem label="ТЕЛ" value={me.statConstitution || 10} icon={Shield} />
                <StatItem label="ИНТ" value={me.statIntelligence || 10} icon={Brain} />
                <StatItem label="МУД" value={me.statWisdom || 10} icon={Eye} />
                <StatItem label="ХАР" value={me.statCharisma || 10} icon={Sparkles} />
              </div>
            </div>

            {/* Status Effects & Mutations */}
            <div className="grid grid-cols-1 gap-6">
              <div className="space-y-3">
                <h4 className="text-[10px] font-black uppercase tracking-[0.3em] text-neutral-600 ml-1">Состояния</h4>
                <div className="flex flex-wrap gap-2">
                  {(!me.statuses || me.statuses.length === 0) ? (
                    <span className="text-xs text-neutral-700 italic">Нет активных состояний</span>
                  ) : (
                    me.statuses.map((s, i) => (
                      <span key={i} className="px-3 py-1 bg-blue-500/10 border border-blue-500/20 text-blue-400 text-[10px] font-bold uppercase rounded-full">
                        {s}
                      </span>
                    ))
                  )}
                </div>
              </div>

              <div className="space-y-3">
                <h4 className="text-[10px] font-black uppercase tracking-[0.3em] text-neutral-600 ml-1">Мутации</h4>
                <div className="flex flex-wrap gap-2">
                  {(!me.mutations || me.mutations.length === 0) ? (
                    <span className="text-xs text-neutral-700 italic">Нет мутаций</span>
                  ) : (
                    me.mutations.map((m, i) => (
                      <span key={i} className="px-3 py-1 bg-green-500/10 border border-green-500/20 text-green-400 text-[10px] font-bold uppercase rounded-full">
                        {m}
                      </span>
                    ))
                  )}
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
