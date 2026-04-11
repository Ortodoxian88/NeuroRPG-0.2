import React from 'react';
import { AppSettings, Player } from '@/src/types';
import { cn } from '@/src/lib/utils';
import { 
  Heart, Zap, Shield, Sword, Brain, Eye, User, Activity, 
  AlertCircle, Sparkles, Wind, Star, ZapOff, Info
} from 'lucide-react';

interface StateTabProps {
  me?: Player;
  appSettings?: AppSettings;
}

const ProgressBar = ({ 
  current, 
  max, 
  color, 
  label, 
  icon: Icon 
}: { 
  current: number, 
  max: number, 
  color: string, 
  label: string, 
  icon: any
}) => {
  const percentage = Math.min(100, Math.max(0, (current / max) * 100));
  
  return (
    <div className="space-y-2">
      <div className="flex justify-between items-end px-1">
        <div className="flex items-center gap-2">
          <Icon size={16} className="text-orange-500/70" />
          <span className="text-xs font-bold uppercase tracking-wider text-neutral-400">{label}</span>
        </div>
        <div className="flex items-baseline gap-1">
          <span className="text-base font-bold text-white">{current}</span>
          <span className="text-[10px] font-medium text-neutral-600">/ {max}</span>
        </div>
      </div>
      
      <div className="h-3 w-full bg-neutral-900 rounded-full overflow-hidden border border-neutral-800 p-0.5">
        <div 
          className={cn("h-full rounded-full transition-all duration-700 ease-out", color)} 
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
};

const StatCard = ({ label, value, icon: Icon }: { label: string, value: number, icon: any }) => (
  <div className="bg-neutral-900/50 border border-neutral-800 p-4 rounded-2xl flex flex-col items-center justify-center space-y-2 hover:border-orange-500/30 transition-all group">
    <div className="w-10 h-10 rounded-xl bg-neutral-800 flex items-center justify-center border border-neutral-700 group-hover:border-orange-500/30 transition-colors">
      <Icon size={20} className="text-neutral-400 group-hover:text-orange-500 transition-colors" />
    </div>
    <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-500">{label}</span>
    <span className="text-xl font-bold text-white">{value}</span>
  </div>
);

export const StateTab = ({ me, appSettings }: StateTabProps) => {
  const isLight = appSettings?.theme === 'light';

  const stats = [
    { label: 'СИЛ', value: me?.stats?.strength || 10, icon: Sword },
    { label: 'ЛОВ', value: me?.stats?.reaction || 10, icon: Wind },
    { label: 'ТЕЛ', value: me?.stats?.durability || 10, icon: Shield },
    { label: 'ИНТ', value: me?.stats?.stamina || 10, icon: Brain },
    { label: 'МУД', value: me?.stats?.speed || 10, icon: Eye },
    { label: 'ХАР', value: me?.stats?.power || 10, icon: Sparkles },
  ];

  return (
    <div className={cn(
      "flex-1 flex flex-col min-h-0 overflow-hidden",
      isLight ? "bg-neutral-50" : "bg-black"
    )}>
      <div className="p-6 border-b border-neutral-800/50 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-orange-500/10 flex items-center justify-center border border-orange-500/20">
            <Activity className="text-orange-500" size={24} />
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
            {/* Vital Signs */}
            <div className="space-y-6 bg-neutral-900/30 p-6 rounded-2xl border border-neutral-800/50">
              <ProgressBar 
                current={me.hp} 
                max={me.maxHp} 
                color="bg-gradient-to-r from-red-600 to-red-500" 
                label="Здоровье (HP)" 
                icon={Heart}
              />
              <ProgressBar 
                current={me.mana} 
                max={me.maxMana} 
                color="bg-gradient-to-r from-blue-600 to-blue-500" 
                label="Мана (MP)" 
                icon={Zap}
              />
              <ProgressBar 
                current={me.stress || 0} 
                max={100} 
                color="bg-gradient-to-r from-purple-600 to-purple-500" 
                label="Стресс" 
                icon={AlertCircle}
              />
            </div>

            {/* Stats Grid */}
            <div className="space-y-4">
              <h4 className="text-[10px] font-bold uppercase tracking-[0.3em] text-neutral-600 ml-1">Основные характеристики</h4>
              <div className="grid grid-cols-3 gap-3">
                {stats.map((s, i) => (
                  <StatCard key={i} label={s.label} value={s.value} icon={s.icon} />
                ))}
              </div>
            </div>

            {/* Status Effects & Mutations */}
            <div className="grid grid-cols-1 gap-6">
              <div className="space-y-3">
                <h4 className="text-[10px] font-bold uppercase tracking-[0.3em] text-neutral-600 ml-1">Активные состояния</h4>
                <div className="flex flex-wrap gap-2">
                  {(!me.statuses || me.statuses.length === 0) ? (
                    <div className="w-full p-4 rounded-xl border border-dashed border-neutral-800 flex items-center justify-center gap-2 opacity-30">
                      <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-500">Нет активных эффектов</span>
                    </div>
                  ) : (
                    me.statuses.map((s, i) => (
                      <div key={i} className="px-3 py-1.5 bg-orange-500/5 border border-orange-500/20 text-orange-400 text-[10px] font-bold uppercase tracking-widest rounded-lg flex items-center gap-2">
                        <div className="w-1 h-1 rounded-full bg-orange-500" />
                        {s}
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="space-y-3">
                <h4 className="text-[10px] font-bold uppercase tracking-[0.3em] text-neutral-600 ml-1">Мутации и особенности</h4>
                <div className="flex flex-wrap gap-2">
                  {(!me.mutations || me.mutations.length === 0) ? (
                    <div className="w-full p-4 rounded-xl border border-dashed border-neutral-800 flex items-center justify-center gap-2 opacity-30">
                      <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-500">Чистая ДНК</span>
                    </div>
                  ) : (
                    me.mutations.map((m, i) => (
                      <div key={i} className="px-3 py-1.5 bg-green-500/5 border border-green-500/20 text-green-400 text-[10px] font-bold uppercase tracking-widest rounded-lg flex items-center gap-2">
                        <div className="w-1 h-1 rounded-full bg-green-500" />
                        {m}
                      </div>
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
