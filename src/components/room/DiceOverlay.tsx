import React from 'react';
import { motion, AnimatePresence } from 'motion/react';

interface DiceOverlayProps {
  showDiceRoll: { player: string; value: number } | null;
}

export default function DiceOverlay({ showDiceRoll }: DiceOverlayProps) {
  return (
    <AnimatePresence>
      {showDiceRoll && (
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 z-50 bg-black/80 backdrop-blur-sm flex flex-col items-center justify-center"
        >
          <motion.div
            initial={{ scale: 0.5, rotate: -180 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: "spring", damping: 12, stiffness: 100 }}
            className="w-32 h-32 bg-orange-600 rounded-2xl flex items-center justify-center shadow-2xl shadow-orange-600/50 mb-6 relative overflow-hidden"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-white/20 to-transparent" />
            <span className="text-6xl font-bold text-white drop-shadow-md z-10">{showDiceRoll.value}</span>
          </motion.div>
          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.3 }}
            className="text-center"
          >
            <h3 className="text-2xl font-bold text-white mb-1 font-display">{showDiceRoll.player}</h3>
            <p className="text-orange-400 text-lg">бросает кубик (d20)</p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
