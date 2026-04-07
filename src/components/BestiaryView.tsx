import React, { useEffect, useState } from 'react';
import { collection, query, orderBy, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { BestiaryEntry } from '../types';
import { ArrowLeft, BookOpen, Search } from 'lucide-react';

export default function BestiaryView({ onBack }: { onBack: () => void }) {
  const [entries, setEntries] = useState<BestiaryEntry[]>([]);
  const [search, setSearch] = useState('');

  useEffect(() => {
    const q = query(collection(db, 'bestiary'), orderBy('title', 'asc'));
    return onSnapshot(q, (snap) => {
      setEntries(snap.docs.map(d => ({ id: d.id, ...d.data() } as BestiaryEntry)));
    });
  }, []);

  const filteredEntries = entries.filter(e => 
    e.title.toLowerCase().includes(search.toLowerCase()) || 
    e.content.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex-1 flex flex-col bg-black text-neutral-200 h-full absolute inset-0 z-50">
      <div className="p-4 border-b border-neutral-800 flex items-center gap-4 bg-black/80 backdrop-blur-md">
        <button onClick={onBack} className="p-2 hover:bg-neutral-900 rounded-full transition-colors">
          <ArrowLeft size={24} className="text-orange-500" />
        </button>
        <h1 className="text-xl font-bold text-white flex items-center gap-2 font-display">
          <BookOpen className="text-orange-500" /> Бестиарий
        </h1>
      </div>
      
      <div className="p-4 border-b border-neutral-900">
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-500" size={20} />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Поиск по бестиарию..."
            className="w-full bg-neutral-900 border border-neutral-800 rounded-2xl py-4 pl-12 pr-4 text-base text-neutral-100 focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500 outline-none"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4 pb-20">
        {entries.length === 0 ? (
          <p className="text-neutral-500 text-center py-8">Бестиарий пока пуст. Исследуйте мир, чтобы пополнить его.</p>
        ) : filteredEntries.length === 0 ? (
          <p className="text-neutral-500 text-center py-8">Ничего не найдено.</p>
        ) : (
          filteredEntries.map(entry => (
            <div key={entry.id} className="bg-neutral-900 border border-neutral-800 rounded-xl p-5">
              <h2 className="text-xl font-bold text-orange-500 mb-2 font-display">{entry.title}</h2>
              <div className="whitespace-pre-wrap text-base text-neutral-300 leading-relaxed">{entry.content}</div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
