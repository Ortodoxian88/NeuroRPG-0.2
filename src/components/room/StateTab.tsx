import React from 'react';
import { Sparkles, Download, UserMinus, Globe, Shield, Clock } from 'lucide-react';
import { Player, Room } from '@/src/types';

interface StateTabProps {
  me: Player | undefined;
  players: Player[];
  isHost: boolean;
  isSpectator: boolean;
  onExportLog: () => void;
  onKickPlayer: (uid: string) => void;
  turn: number;
  storySummary: string;
  room: Room;
}

export default function StateTab({
  me,
  players,
  isHost,
  isSpectator,
  onExportLog,
  onKickPlayer,
  turn,
  storySummary,
  room
}: StateTabProps) {
  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-6">
      <h2 className="text-xl font-bold text-white flex items-center justify-between mb-2 font-display">
        <div className="flex items-center gap-2">
          <Sparkles className="text-orange-500" /> Состояние
        </div>
        {isHost && (
          <button onClick={onExportLog} className="text-xs flex items-center gap-1 bg-neutral-800 hover:bg-neutral-700 px-2 py-1 rounded transition-colors text-neutral-300">
            <Download size={14} /> Экспорт лога
          </button>
        )}
      </h2>
      
      <div className="bg-neutral-900/50 border border-neutral-800 rounded-xl p-5 space-y-2">
        <div className="flex justify-between items-center mb-2">
          <span className="text-sm font-bold uppercase tracking-widest text-neutral-500">Текущий ход</span>
          <span className="text-orange-500 font-mono font-bold text-xl">{turn}</span>
        </div>
        {storySummary && (
          <div className="text-sm text-neutral-400 italic leading-relaxed border-t border-neutral-800 pt-3">
            {storySummary}
          </div>
        )}
      </div>

      {room.worldState && (
        <div className="bg-neutral-900/50 border border-neutral-800 rounded-xl p-5 space-y-2">
          <h3 className="text-base font-medium text-neutral-300 flex items-center gap-2 mb-2">
            <Globe size={18} className="text-blue-400" /> Компендиум мира
          </h3>
          <p className="text-sm text-neutral-400 leading-relaxed whitespace-pre-wrap">
            {room.worldState}
          </p>
        </div>
      )}

      {isHost && room.factions && Object.keys(room.factions).length > 0 && (
        <div className="bg-neutral-900/50 border border-neutral-800 rounded-xl p-4 space-y-2">
          <h3 className="text-sm font-medium text-neutral-300 flex items-center gap-2 mb-2">
            <Shield size={16} className="text-purple-400" /> Фракции (Скрыто)
          </h3>
          <div className="space-y-2">
            {Object.entries(room.factions).map(([faction, desc], i) => (
              <div key={i} className="text-xs">
                <span className="font-bold text-neutral-300">{faction}: </span>
                <span className="text-neutral-500">{desc}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {isHost && room.hiddenTimers && Object.keys(room.hiddenTimers).length > 0 && (
        <div className="bg-neutral-900/50 border border-neutral-800 rounded-xl p-4 space-y-2">
          <h3 className="text-sm font-medium text-neutral-300 flex items-center gap-2 mb-2">
            <Clock size={16} className="text-red-400" /> Скрытые таймеры
          </h3>
          <div className="space-y-2">
            {Object.entries(room.hiddenTimers).map(([event, turns], i) => (
              <div key={i} className="flex justify-between text-xs">
                <span className="text-neutral-400">{event}</span>
                <span className="font-mono text-red-400">{turns} ходов</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {isSpectator ? (
        <div className="space-y-4">
          <p className="text-neutral-500 text-sm mb-4">Вы наблюдатель. Состояние игроков:</p>
          {players.map(p => (
            <div key={p.uid} className="bg-neutral-900 border border-neutral-800 rounded-xl p-4 space-y-2">
              <div className="flex justify-between items-center">
                <span className="font-bold text-white">{p.name}</span>
                <span className="text-xs text-neutral-400">HP: {p.hp}/{p.maxHp} | MP: {p.mana}/{p.maxMana}</span>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <>
          <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4 space-y-4">
            <div className="space-y-1">
              <div className="flex justify-between text-sm">
                <span className="text-red-400 font-medium">Здоровье (HP)</span>
                <span className="text-neutral-300">{me?.hp} / {me?.maxHp}</span>
              </div>
              <div className="h-2 bg-neutral-800 rounded-full overflow-hidden">
                <div className="h-full bg-red-500 transition-all" style={{ width: `${Math.max(0, Math.min(100, ((me?.hp || 0) / (me?.maxHp || 1)) * 100))}%` }} />
              </div>
            </div>
            
            <div className="space-y-1">
              <div className="flex justify-between text-sm">
                <span className="text-blue-400 font-medium">Мана (MP)</span>
                <span className="text-neutral-300">{me?.mana} / {me?.maxMana}</span>
              </div>
              <div className="h-2 bg-neutral-800 rounded-full overflow-hidden">
                <div className="h-full bg-blue-500 transition-all" style={{ width: `${Math.max(0, Math.min(100, ((me?.mana || 0) / (me?.maxMana || 1)) * 100))}%` }} />
              </div>
            </div>

            <div className="space-y-1">
              <div className="flex justify-between text-sm">
                <span className="text-purple-400 font-medium">Стресс</span>
                <span className="text-neutral-300">{me?.stress || 0} / 100</span>
              </div>
              <div className="h-2 bg-neutral-800 rounded-full overflow-hidden">
                <div className="h-full bg-purple-500 transition-all" style={{ width: `${Math.max(0, Math.min(100, me?.stress || 0))}%` }} />
              </div>
            </div>
            
            <div className="flex justify-between text-sm pt-2 border-t border-neutral-800/50">
              <span className="text-neutral-400">Мировоззрение:</span>
              <span className="text-orange-400 font-medium">{me?.alignment || 'Нейтральное'}</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <h3 className="text-sm font-medium text-neutral-400 mb-2 uppercase tracking-wider">Состояния</h3>
              {(!me?.statuses || me.statuses.length === 0) ? (
                <p className="text-neutral-600 text-sm italic">Нет активных состояний</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {me.statuses.map((status, i) => (
                    <span key={i} className="text-xs bg-red-900/30 text-red-400 px-2 py-1 rounded border border-red-900/50">{status}</span>
                  ))}
                </div>
              )}
            </div>
            <div>
              <h3 className="text-sm font-medium text-neutral-400 mb-2 uppercase tracking-wider">Травмы</h3>
              {(!me?.injuries || me.injuries.length === 0) ? (
                <p className="text-neutral-600 text-sm italic">Нет травм</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {me.injuries.map((injury, i) => (
                    <span key={i} className="text-xs bg-orange-900/30 text-orange-400 px-2 py-1 rounded border border-orange-900/50">{injury}</span>
                  ))}
                </div>
              )}
            </div>
            <div>
              <h3 className="text-sm font-medium text-neutral-400 mb-2 uppercase tracking-wider">Мутации</h3>
              {(!me?.mutations || me.mutations.length === 0) ? (
                <p className="text-neutral-600 text-sm italic">Нет мутаций</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {me.mutations.map((mutation, i) => (
                    <span key={i} className="text-xs bg-green-900/30 text-green-400 px-2 py-1 rounded border border-green-900/50">{mutation}</span>
                  ))}
                </div>
              )}
            </div>
            <div>
              <h3 className="text-sm font-medium text-neutral-400 mb-2 uppercase tracking-wider">Репутация</h3>
              {(!me?.reputation || Object.keys(me.reputation).length === 0) ? (
                <p className="text-neutral-600 text-sm italic">Нет данных</p>
              ) : (
                <div className="space-y-1.5">
                  {Object.entries(me.reputation).map(([faction, value], i) => (
                    <div key={i} className="flex justify-between text-xs">
                      <span className="text-neutral-400">{faction}:</span>
                      <span className={value > 0 ? 'text-green-400' : value < 0 ? 'text-red-400' : 'text-neutral-500'}>{value}</span>
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
                  <li key={i} className="bg-neutral-900 border border-neutral-800 p-3 rounded-lg text-neutral-200 flex items-center gap-3 text-sm">
                    <div className="w-1.5 h-1.5 rounded-full bg-orange-500/50" />
                    {skill}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="pt-6 border-t border-neutral-800">
            <h3 className="text-sm font-medium text-neutral-400 mb-3 uppercase tracking-wider">Другие игроки</h3>
            <div className="space-y-3">
              {players.filter(p => p.uid !== me?.uid).map(p => (
                <div key={p.uid} className="bg-neutral-900/30 border border-neutral-800/50 p-3 rounded-lg flex items-center justify-between">
                  <div className="flex flex-col gap-1">
                    <span className="text-sm font-medium text-neutral-200">{p.name}</span>
                    <div className="flex gap-2 text-[10px] text-neutral-500">
                      <span className="text-red-400/70">HP: {p.hp}/{p.maxHp}</span>
                      <span className="text-blue-400/70">MP: {p.mana}/{p.maxMana}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {p.isReady ? (
                      <span className="text-[10px] bg-green-500/10 text-green-400 px-2 py-0.5 rounded border border-green-500/20">Готов</span>
                    ) : (
                      <span className="text-[10px] bg-neutral-800 text-neutral-500 px-2 py-0.5 rounded">Думает...</span>
                    )}
                  </div>
                </div>
              ))}
              {players.filter(p => p.uid !== me?.uid).length === 0 && (
                <p className="text-neutral-600 text-xs italic">Вы единственный игрок в этой сессии.</p>
              )}
            </div>
          </div>
        </>
      )}
      
      {isHost && (
        <div className="mt-8 pt-6 border-t border-neutral-800">
          <h3 className="text-sm font-medium text-neutral-400 mb-3 uppercase tracking-wider">Управление игроками</h3>
          <div className="space-y-2">
            {players.map(p => (
              <div key={p.uid} className="flex items-center justify-between bg-neutral-900 p-3 rounded-lg border border-neutral-800">
                <span className="text-sm text-neutral-200">{p.name}</span>
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
