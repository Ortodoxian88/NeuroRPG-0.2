import React from 'react';
import { Sparkles, Download, UserMinus } from 'lucide-react';
import { Player } from '@/src/types';

interface StateTabProps {
  me: Player | undefined;
  players: Player[];
  isHost: boolean;
  isSpectator: boolean;
  onExportLog: () => void;
  onKickPlayer: (uid: string) => void;
}

export default function StateTab({
  me,
  players,
  isHost,
  isSpectator,
  onExportLog,
  onKickPlayer
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
