import React from 'react';

export const DiceOverlay = ({ showDiceRoll }: { showDiceRoll: any }) => {
  if (!showDiceRoll) return null;
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center text-white">
      <div className="bg-neutral-800 p-6 rounded-xl">
        <h3 className="text-xl font-bold mb-2">Бросок кубика</h3>
        <p>Игрок {showDiceRoll.player} выбросил {showDiceRoll.value}</p>
      </div>
    </div>
  );
};
