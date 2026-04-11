import React from 'react';
import { cn } from '@/src/lib/utils';

interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
  appSettings?: any;
}

export const ConfirmModal = ({ isOpen, title, message, onConfirm, onCancel, appSettings }: ConfirmModalProps) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/80 backdrop-blur-sm">
      <div className={cn(
        "w-full max-w-sm border rounded-3xl p-6 shadow-2xl space-y-6",
        appSettings?.theme === 'light' ? "bg-white border-neutral-200" : "bg-neutral-900 border-neutral-800"
      )}>
        <h3 className={cn("text-lg font-bold", appSettings?.theme === 'light' ? "text-neutral-900" : "text-white")}>{title}</h3>
        <p className={cn("text-sm", appSettings?.theme === 'light' ? "text-neutral-600" : "text-neutral-400")}>{message}</p>
        <div className="flex gap-3">
          <button onClick={onCancel} className="flex-1 py-3 text-sm font-bold rounded-xl bg-neutral-800 text-neutral-300 hover:bg-neutral-700">Отмена</button>
          <button onClick={onConfirm} className="flex-1 py-3 text-sm font-bold rounded-xl bg-red-600 text-white hover:bg-red-500">Подтвердить</button>
        </div>
      </div>
    </div>
  );
};
