import React from 'react';
import { Sparkles, Download, UserMinus, Globe, Shield, Clock, Plus, Minus } from 'lucide-react';
import { Player, Room, AppSettings } from '@/src/types';
import { cn } from '@/src/lib/utils';

interface StateTabProps {
  me: Player | undefined;
  players: Player[];
  isHost: boolean;
  isSpectator: boolean;
  onExportLog: () => void;
  onKickPlayer: (uid: string) => void;
  onUpdatePlayer: (updates: Partial<Player>) => Promise<void>;
  turn: number;
  storySummary: string;
  room: Room;
  appSettings?: AppSettings;
}

export default function StateTab({
  me,
  players,
  isHost,
  isSpectator,
  onExportLog,
  onKickPlayer,
  onUpdatePlayer,
  turn,
  storySummary,
  room,
  appSettings
}: StateTabProps) {
  const isLight = appSettings?.theme === 'light';

  const adjustStat = (stat: 'hp' | 'mana' | 'stress', delta: number) => {
    if (!me) return;
    const current = me[stat] || 0;
    const max = stat === 'hp' ? me.maxHp : stat === 'mana' ? me.maxMana : 100;
    const newValue = Math.max(0, Math.min(max, current + delta));
    onUpdatePlayer({ [stat]: newValue });
  };

  return (
    <div className={cn(
      "flex-1 overflow-y-auto p-4 space-y-6",
      isLight ? "bg-neutral-50" : "bg-black"
    )}>
      <h2 className={cn(
        "text-xl font-bold flex items-center justify-between mb-2 font-display",
        isLight ? "text-neutral-900" : "text-white"
      )}>
        <div className="flex items-center gap-2">
          <Sparkles className="text-orange-500" /> Состояние
        </div>
        {isHost && (
          <button 
            onClick={onExportLog} 
            className={cn(
              "text-xs flex items-center gap-1 px-2 py-1 rounded transition-colors",
              isLight ? "bg-neutral-200 hover:bg-neutral-300 text-neutral-700" : "bg-neutral-800 hover:bg-neutral-700 text-neutral-300"
            )}
          >
            <Download size={14} /> Экспорт лога
          </button>
        )}
      </h2>
      
      <div className={cn(
        "border rounded-xl p-5 space-y-2",
        isLight ? "bg-white border-neutral-200 shadow-sm" : "bg-neutral-900/50 border-neutral-800"
      )}>
        <div className="flex justify-between items-center mb-2">
          <span className="text-sm font-bold uppercase tracking-widest text-neutral-500">Текущий ход</span>
          <span className="text-orange-500 font-mono font-bold text-xl">{turn}</span>
        </div>
        {storySummary && (
          <div className={cn(
            "text-sm italic leading-relaxed border-t pt-3",
            isLight ? "text-neutral-600 border-neutral-100" : "text-neutral-400 border-neutral-800"
          )}>
            {storySummary}
          </div>
        )}
      </div>

      {room.worldState && (
        <div className={cn(
          "border rounded-xl p-5 space-y-2",
          isLight ? "bg-white border-neutral-200 shadow-sm" : "bg-neutral-900/50 border-neutral-800"
        )}>
          <h3 className={cn(
            "text-base font-medium flex items-center gap-2 mb-2",
            isLight ? "text-neutral-800" : "text-neutral-300"
          )}>
            <Globe size={18} className="text-blue-500" /> Компендиум мира
          </h3>
          <p className={cn(
            "text-sm leading-relaxed whitespace-pre-wrap",
            isLight ? "text-neutral-600" : "text-neutral-400"
          )}>
            {room.worldState}
          </p>
        </div>
      )}

      {isHost && room.factions && Object.keys(room.factions).length > 0 && (
        <div className={cn(
          "border rounded-xl p-4 space-y-2",
          isLight ? "bg-white border-neutral-200 shadow-sm" : "bg-neutral-900/50 border-neutral-800"
        )}>
          <h3 className={cn(
            "text-sm font-medium flex items-center gap-2 mb-2",
            isLight ? "text-neutral-800" : "text-neutral-300"
          )}>
            <Shield size={16} className="text-purple-500" /> Фракции (Скрыто)
          </h3>
          <div className="space-y-2">
            {Object.entries(room.factions).map(([faction, desc], i) => (
              <div key={i} className="text-xs">
                <span className={cn("font-bold", isLight ? "text-neutral-700" : "text-neutral-300")}>{faction}: </span>
                <span className="text-neutral-500">{desc}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {isHost && room.hiddenTimers && Object.keys(room.hiddenTimers).length > 0 && (
        <div className={cn(
          "border rounded-xl p-4 space-y-2",
          isLight ? "bg-white border-neutral-200 shadow-sm" : "bg-neutral-900/50 border-neutral-800"
        )}>
          <h3 className={cn(
            "text-sm font-medium flex items-center gap-2 mb-2",
            isLight ? "text-neutral-800" : "text-neutral-300"
          )}>
            <Clock size={16} className="text-red-500" /> Скрытые таймеры
          </h3>
          <div className="space-y-2">
            {Object.entries(room.hiddenTimers).map(([event, turns], i) => (
              <div key={i} className="flex justify-between text-xs">
                <span className="text-neutral-400">{event}</span>
                <span className="font-mono text-red-500">{turns} ходов</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {isSpectator ? (
        <div className="space-y-4">
          <p className="text-neutral-500 text-sm mb-4">Вы наблюдатель. Состояние игроков:</p>
          {players.map(p => (
            <div key={p.uid} className={cn(
              "border rounded-xl p-4 space-y-2",
              isLight ? "bg-white border-neutral-200 shadow-sm" : "bg-neutral-900 border-neutral-800"
            )}>
              <div className="flex justify-between items-center">
                <span className={cn("font-bold", isLight ? "text-neutral-900" : "text-white")}>{p.name}</span>
                <span className="text-xs text-neutral-400">HP: {p.hp}/{p.maxHp} | MP: {p.mana}/{p.maxMana}</span>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <>
          <div className={cn(
            "border rounded-xl p-4 space-y-6",
            isLight ? "bg-white border-neutral-200 shadow-sm" : "bg-neutral-900 border-neutral-800"
          )}>
            <div className="space-y-2">
              <div className="flex justify-between text-sm items-center">
                <span className="text-red-500 font-bold uppercase tracking-wider text-xs">Здоровье (HP)</span>
                <div className="flex items-center gap-3">
                  <button onClick={() => adjustStat('hp', -1)} className="p-1 hover:bg-red-500/10 rounded text-red-500 transition-colors"><Minus size={16} /></button>
                  <span className={cn("font-mono font-bold text-base w-12 text-center", isLight ? "text-neutral-700" : "text-neutral-300")}>{me?.hp} / {me?.maxHp}</span>
                  <button onClick={() => adjustStat('hp', 1)} className="p-1 hover:bg-red-500/10 rounded text-red-500 transition-colors"><Plus size={16} /></button>
                </div>
              </div>
              <div className={cn("h-2.5 rounded-full overflow-hidden", isLight ? "bg-neutral-100" : "bg-neutral-800")}>
                <div className="h-full bg-red-500 transition-all duration-500" style={{ width: `${Math.max(0, Math.min(100, ((me?.hp || 0) / (me?.maxHp || 1)) * 100))}%` }} />
              </div>
            </div>
            
            <div className="space-y-2">
              <div className="flex justify-between text-sm items-center">
                <span className="text-blue-500 font-bold uppercase tracking-wider text-xs">Мана (MP)</span>
                <div className="flex items-center gap-3">
                  <button onClick={() => adjustStat('mana', -1)} className="p-1 hover:bg-blue-500/10 rounded text-blue-500 transition-colors"><Minus size={16} /></button>
                  <span className={cn("font-mono font-bold text-base w-12 text-center", isLight ? "text-neutral-700" : "text-neutral-300")}>{me?.mana} / {me?.maxMana}</span>
                  <button onClick={() => adjustStat('mana', 1)} className="p-1 hover:bg-blue-500/10 rounded text-blue-500 transition-colors"><Plus size={16} /></button>
                </div>
              </div>
              <div className={cn("h-2.5 rounded-full overflow-hidden", isLight ? "bg-neutral-100" : "bg-neutral-800")}>
                <div className="h-full bg-blue-500 transition-all duration-500" style={{ width: `${Math.max(0, Math.min(100, ((me?.mana || 0) / (me?.maxMana || 1)) * 100))}%` }} />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between text-sm items-center">
                <span className="text-purple-500 font-bold uppercase tracking-wider text-xs">Стресс</span>
                <div className="flex items-center gap-3">
                  <button onClick={() => adjustStat('stress', -1)} className="p-1 hover:bg-purple-500/10 rounded text-purple-500 transition-colors"><Minus size={16} /></button>
                  <span className={cn("font-mono font-bold text-base w-12 text-center", isLight ? "text-neutral-700" : "text-neutral-300")}>{me?.stress || 0} / 100</span>
                  <button onClick={() => adjustStat('stress', 1)} className="p-1 hover:bg-purple-500/10 rounded text-purple-500 transition-colors"><Plus size={16} /></button>
                </div>
              </div>
              <div className={cn("h-2.5 rounded-full overflow-hidden", isLight ? "bg-neutral-100" : "bg-neutral-800")}>
                <div className="h-full bg-purple-500 transition-all duration-500" style={{ width: `${Math.max(0, Math.min(100, me?.stress || 0))}%` }} />
              </div>
            </div>
            
            <div className={cn(
              "flex justify-between text-sm pt-4 border-t",
              isLight ? "border-neutral-100" : "border-neutral-800/50"
            )}>
              <span className="text-neutral-400 font-medium">Мировоззрение:</span>
              <span className="text-orange-500 font-bold">{me?.alignment || 'Нейтральное'}</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {me?.stats && (
              <div className="col-span-2">
                <h3 className="text-sm font-medium text-neutral-400 mb-2 uppercase tracking-wider">Физические параметры</h3>
                <div className="grid grid-cols-3 gap-2">
                  <div className={cn("p-2 rounded border flex flex-col items-center justify-center", isLight ? "bg-white border-neutral-200" : "bg-neutral-900 border-neutral-800")}>
                    <span className="text-[10px] text-neutral-500 uppercase">Скорость</span>
                    <span className={cn("font-mono font-bold", isLight ? "text-neutral-800" : "text-neutral-200")}>{me.stats.speed}</span>
                  </div>
                  <div className={cn("p-2 rounded border flex flex-col items-center justify-center", isLight ? "bg-white border-neutral-200" : "bg-neutral-900 border-neutral-800")}>
                    <span className="text-[10px] text-neutral-500 uppercase">Реакция</span>
                    <span className={cn("font-mono font-bold", isLight ? "text-neutral-800" : "text-neutral-200")}>{me.stats.reaction}</span>
                  </div>
                  <div className={cn("p-2 rounded border flex flex-col items-center justify-center", isLight ? "bg-white border-neutral-200" : "bg-neutral-900 border-neutral-800")}>
                    <span className="text-[10px] text-neutral-500 uppercase">Подъём</span>
                    <span className={cn("font-mono font-bold", isLight ? "text-neutral-800" : "text-neutral-200")}>{me.stats.strength}</span>
                  </div>
                  <div className={cn("p-2 rounded border flex flex-col items-center justify-center", isLight ? "bg-white border-neutral-200" : "bg-neutral-900 border-neutral-800")}>
                    <span className="text-[10px] text-neutral-500 uppercase">Урон</span>
                    <span className={cn("font-mono font-bold", isLight ? "text-neutral-800" : "text-neutral-200")}>{me.stats.power}</span>
                  </div>
                  <div className={cn("p-2 rounded border flex flex-col items-center justify-center", isLight ? "bg-white border-neutral-200" : "bg-neutral-900 border-neutral-800")}>
                    <span className="text-[10px] text-neutral-500 uppercase">Прочность</span>
                    <span className={cn("font-mono font-bold", isLight ? "text-neutral-800" : "text-neutral-200")}>{me.stats.durability}</span>
                  </div>
                  <div className={cn("p-2 rounded border flex flex-col items-center justify-center", isLight ? "bg-white border-neutral-200" : "bg-neutral-900 border-neutral-800")}>
                    <span className="text-[10px] text-neutral-500 uppercase">Выносл.</span>
                    <span className={cn("font-mono font-bold", isLight ? "text-neutral-800" : "text-neutral-200")}>{me.stats.stamina}</span>
                  </div>
                </div>
              </div>
            )}

            <div>
              <h3 className="text-sm font-medium text-neutral-400 mb-2 uppercase tracking-wider">Состояния</h3>
              {(!me?.statuses || me.statuses.length === 0) ? (
                <p className="text-neutral-500 text-sm italic">Нет активных состояний</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {me.statuses.map((status, i) => (
                    <span key={i} className="text-xs bg-red-500/10 text-red-600 dark:text-red-400 px-2 py-1 rounded border border-red-500/20">{status}</span>
                  ))}
                </div>
              )}
            </div>
            <div>
              <h3 className="text-sm font-medium text-neutral-400 mb-2 uppercase tracking-wider">Травмы</h3>
              {(!me?.injuries || me.injuries.length === 0) ? (
                <p className="text-neutral-500 text-sm italic">Нет травм</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {me.injuries.map((injury, i) => (
                    <span key={i} className="text-xs bg-orange-500/10 text-orange-600 dark:text-orange-400 px-2 py-1 rounded border border-orange-500/20">{injury}</span>
                  ))}
                </div>
              )}
            </div>
            <div>
              <h3 className="text-sm font-medium text-neutral-400 mb-2 uppercase tracking-wider">Мутации</h3>
              {(!me?.mutations || me.mutations.length === 0) ? (
                <p className="text-neutral-500 text-sm italic">Нет мутаций</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {me.mutations.map((mutation, i) => (
                    <span key={i} className="text-xs bg-green-500/10 text-green-600 dark:text-green-400 px-2 py-1 rounded border border-green-500/20">{mutation}</span>
                  ))}
                </div>
              )}
            </div>
            <div>
              <h3 className="text-sm font-medium text-neutral-400 mb-2 uppercase tracking-wider">Репутация</h3>
              {(!me?.reputation || Object.keys(me.reputation).length === 0) ? (
                <p className="text-neutral-500 text-sm italic">Нет данных</p>
              ) : (
                <div className="space-y-1.5">
                  {Object.entries(me.reputation).map(([faction, value], i) => (
                    <div key={i} className="flex justify-between text-xs">
                      <span className="text-neutral-400">{faction}:</span>
                      <span className={value > 0 ? 'text-green-600 dark:text-green-400' : value < 0 ? 'text-red-600 dark:text-red-400' : 'text-neutral-500'}>{value}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div>
            <h3 className="text-sm font-medium text-neutral-400 mb-3 uppercase tracking-wider">Навыки</h3>
            {me?.skills.length === 0 ? (
              <p className="text-neutral-500 text-sm">У вас нет особых навыков.</p>
            ) : (
              <ul className="space-y-2">
                {me?.skills.map((skill, i) => (
                  <li key={i} className={cn(
                    "border p-3 rounded-lg flex items-center gap-3 text-sm transition-all",
                    isLight ? "bg-white border-neutral-200 text-neutral-800 shadow-sm" : "bg-neutral-900 border-neutral-800 text-neutral-200"
                  )}>
                    <div className="w-1.5 h-1.5 rounded-full bg-orange-500/50" />
                    {skill}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className={cn("pt-6 border-t", isLight ? "border-neutral-200" : "border-neutral-800")}>
            <h3 className="text-sm font-medium text-neutral-400 mb-3 uppercase tracking-wider">Другие игроки</h3>
            <div className="space-y-3">
              {players.filter(p => p.uid !== me?.uid).map(p => (
                <div key={p.uid} className={cn(
                  "border p-3 rounded-lg flex items-center justify-between",
                  isLight ? "bg-white border-neutral-200 shadow-sm" : "bg-neutral-900/30 border-neutral-800/50"
                )}>
                  <div className="flex flex-col gap-1">
                    <span className={cn("text-sm font-medium", isLight ? "text-neutral-900" : "text-neutral-200")}>{p.name}</span>
                    <div className="flex gap-2 text-[10px] text-neutral-500">
                      <span className="text-red-500/70">HP: {p.hp}/{p.maxHp}</span>
                      <span className="text-blue-500/70">MP: {p.mana}/{p.maxMana}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {p.isReady ? (
                      <span className="text-[10px] bg-green-500/10 text-green-600 dark:text-green-400 px-2 py-0.5 rounded border border-green-500/20">Готов</span>
                    ) : (
                      <span className={cn("text-[10px] px-2 py-0.5 rounded", isLight ? "bg-neutral-100 text-neutral-500" : "bg-neutral-800 text-neutral-500")}>Думает...</span>
                    )}
                  </div>
                </div>
              ))}
              {players.filter(p => p.uid !== me?.uid).length === 0 && (
                <p className="text-neutral-500 text-xs italic">Вы единственный игрок в этой сессии.</p>
              )}
            </div>
          </div>
        </>
      )}
      
      {isHost && (
        <div className={cn("mt-8 pt-6 border-t", isLight ? "border-neutral-200" : "border-neutral-800")}>
          <h3 className="text-sm font-medium text-neutral-400 mb-3 uppercase tracking-wider">Управление игроками</h3>
          <div className="space-y-2">
            {players.map(p => (
              <div key={p.uid} className={cn(
                "flex items-center justify-between p-3 rounded-lg border",
                isLight ? "bg-white border-neutral-200 shadow-sm" : "bg-neutral-900 border-neutral-800"
              )}>
                <span className={cn("text-sm", isLight ? "text-neutral-900" : "text-neutral-200")}>{p.name}</span>
                <button 
                  onClick={() => onKickPlayer(p.uid)}
                  className="text-red-500 hover:text-red-400 p-1 bg-red-500/10 rounded transition-colors"
                  title="Исключить игрока"
                >
                  <UserMinus size={16} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
