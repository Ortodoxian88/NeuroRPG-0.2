import React, { useEffect, useState, useMemo } from 'react';
import { BestiaryEntry, AppSettings } from '../types';
import { ArrowLeft, BookOpen, Search, Filter, Tag, Info, Feather } from 'lucide-react';
import { cn } from '../lib/utils';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { api } from '../services/api';

export default function BestiaryView({ onBack, appSettings }: { onBack: () => void, appSettings: AppSettings }) {
  const [entries, setEntries] = useState<BestiaryEntry[]>([]);
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedEntry, setSelectedEntry] = useState<BestiaryEntry | null>(null);

  useEffect(() => {
    const fetchBestiary = async () => {
      try {
        const data = await api.getBestiary();
        setEntries(data.map((d: any) => ({
          id: d.id,
          title: d.title,
          category: d.category,
          content: d.content,
          tags: d.tags,
          nature: d.nature,
          level: d.knowledge_level
        })));
      } catch (error) {
        console.error("Failed to fetch bestiary", error);
      }
    };
    fetchBestiary();
  }, []);

  const categories = useMemo(() => {
    const cats = new Set(entries.map(e => e.category).filter(Boolean));
    return Array.from(cats);
  }, [entries]);

  const filteredEntries = useMemo(() => {
    return entries.filter(e => {
      const matchesSearch = e.title.toLowerCase().includes(search.toLowerCase()) || 
                            (e.tags && e.tags.some(t => t.toLowerCase().includes(search.toLowerCase())));
      const matchesCategory = selectedCategory ? e.category === selectedCategory : true;
      return matchesSearch && matchesCategory;
    });
  }, [entries, search, selectedCategory]);

  if (selectedEntry) {
    return (
      <div className={cn(
        "flex-1 flex flex-col h-full absolute inset-0 z-50 overflow-hidden",
        appSettings.theme === 'light' ? "bg-[#f4ecd8]" : "bg-neutral-950"
      )}>
        <div className={cn(
          "p-4 border-b flex items-center gap-4 backdrop-blur-md sticky top-0 z-10",
          appSettings.theme === 'light' ? "bg-[#f4ecd8]/90 border-[#d3c5a3]" : "bg-neutral-950/90 border-neutral-800"
        )}>
          <button 
            onClick={() => setSelectedEntry(null)} 
            className={cn(
              "p-2 rounded-full transition-colors",
              appSettings.theme === 'light' ? "hover:bg-[#e8dcc4]" : "hover:bg-neutral-900"
            )}
          >
            <ArrowLeft size={24} className="text-orange-700 dark:text-orange-500" />
          </button>
          <div className="flex-1">
            <h1 className={cn(
              "text-xl font-bold font-serif",
              appSettings.theme === 'light' ? "text-[#3e2723]" : "text-neutral-100"
            )}>
              {selectedEntry.title}
            </h1>
            <p className="text-xs text-orange-700/70 dark:text-orange-500/70 uppercase tracking-widest">{selectedEntry.category || 'Неизвестно'}</p>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 pb-24">
          <div className={cn(
            "max-w-2xl mx-auto rounded-sm p-8 shadow-2xl relative",
            appSettings.theme === 'light' ? "bg-[#fdfbf7] border border-[#e8dcc4]" : "bg-neutral-900 border border-neutral-800"
          )}>
            {/* Decorative corners */}
            <div className="absolute top-2 left-2 w-4 h-4 border-t-2 border-l-2 border-orange-800/20 dark:border-orange-500/20"></div>
            <div className="absolute top-2 right-2 w-4 h-4 border-t-2 border-r-2 border-orange-800/20 dark:border-orange-500/20"></div>
            <div className="absolute bottom-2 left-2 w-4 h-4 border-b-2 border-l-2 border-orange-800/20 dark:border-orange-500/20"></div>
            <div className="absolute bottom-2 right-2 w-4 h-4 border-b-2 border-r-2 border-orange-800/20 dark:border-orange-500/20"></div>

            <div className="flex flex-wrap gap-2 mb-6">
              {selectedEntry.tags?.map(tag => (
                <span key={tag} className="px-2 py-1 bg-orange-100 dark:bg-orange-900/30 text-orange-800 dark:text-orange-400 text-xs rounded-md border border-orange-200 dark:border-orange-800/50 flex items-center gap-1">
                  <Tag size={10} /> {tag}
                </span>
              ))}
              <span className="px-2 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-400 text-xs rounded-md border border-blue-200 dark:border-blue-800/50 flex items-center gap-1">
                <Info size={10} /> Уровень знаний: {selectedEntry.level || 1}
              </span>
              {selectedEntry.nature && (
                <span className={cn(
                  "px-2 py-1 text-xs rounded-md border flex items-center gap-1",
                  selectedEntry.nature === 'positive' ? "bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-400 border-green-200 dark:border-green-800/50" :
                  selectedEntry.nature === 'negative' ? "bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-400 border-red-200 dark:border-red-800/50" :
                  "bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 border-neutral-200 dark:border-neutral-700"
                )}>
                  {selectedEntry.nature === 'positive' ? 'Благотворное' : selectedEntry.nature === 'negative' ? 'Вредоносное' : 'Нейтральное'}
                </span>
              )}
            </div>

            <div className={cn(
              "prose prose-sm sm:prose-base max-w-none font-serif",
              appSettings.theme === 'light' ? "prose-stone prose-headings:text-[#3e2723] prose-a:text-orange-700" : "prose-invert prose-headings:text-neutral-100 prose-a:text-orange-400"
            )}>
              <Markdown remarkPlugins={[remarkGfm]}>{selectedEntry.content}</Markdown>
            </div>

            {selectedEntry.authorNotes && (
              <div className="mt-8 pt-6 border-t border-orange-800/10 dark:border-orange-500/10">
                <div className="flex items-start gap-3">
                  <Feather className="text-orange-700/50 dark:text-orange-500/50 mt-1" size={20} />
                  <p className="text-sm italic text-orange-900/70 dark:text-orange-200/70 font-serif">
                    "{selectedEntry.authorNotes}"<br/>
                    <span className="text-xs not-italic opacity-70">— Магистр Элиас</span>
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={cn(
      "flex-1 flex flex-col h-full absolute inset-0 z-50",
      appSettings.theme === 'light' ? "bg-[#f4ecd8]" : "bg-neutral-950"
    )}>
      <div className={cn(
        "p-4 border-b flex flex-col gap-4 backdrop-blur-md",
        appSettings.theme === 'light' ? "bg-[#f4ecd8]/90 border-[#d3c5a3]" : "bg-neutral-950/90 border-neutral-800"
      )}>
        <div className="flex items-center gap-4">
          <button 
            onClick={onBack} 
            className={cn(
              "p-2 rounded-full transition-colors",
              appSettings.theme === 'light' ? "hover:bg-[#e8dcc4]" : "hover:bg-neutral-900"
            )}
          >
            <ArrowLeft size={24} className="text-orange-700 dark:text-orange-500" />
          </button>
          <h1 className={cn(
            "text-2xl font-bold flex items-center gap-2 font-serif",
            appSettings.theme === 'light' ? "text-[#3e2723]" : "text-white"
          )}>
            <BookOpen className="text-orange-700 dark:text-orange-500" /> Великая Энциклопедия
          </h1>
        </div>

        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-orange-700/50 dark:text-orange-500/50" size={20} />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Поиск по архивам (название, теги)..."
            className={cn(
              "w-full border rounded-xl py-3 pl-12 pr-4 text-base focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500 outline-none transition-all font-serif",
              appSettings.theme === 'light' ? "bg-[#fdfbf7] border-[#d3c5a3] text-[#3e2723] placeholder:text-[#3e2723]/40" : "bg-neutral-900 border-neutral-800 text-neutral-100"
            )}
          />
        </div>

        {categories.length > 0 && (
          <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
            <button
              onClick={() => setSelectedCategory(null)}
              className={cn(
                "px-4 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors border",
                selectedCategory === null 
                  ? "bg-orange-700 text-white border-orange-700 dark:bg-orange-600 dark:border-orange-600" 
                  : appSettings.theme === 'light' ? "bg-[#fdfbf7] border-[#d3c5a3] text-[#3e2723]" : "bg-neutral-900 border-neutral-800 text-neutral-300"
              )}
            >
              Все записи
            </button>
            {categories.map(cat => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={cn(
                  "px-4 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors border",
                  selectedCategory === cat 
                    ? "bg-orange-700 text-white border-orange-700 dark:bg-orange-600 dark:border-orange-600" 
                    : appSettings.theme === 'light' ? "bg-[#fdfbf7] border-[#d3c5a3] text-[#3e2723]" : "bg-neutral-900 border-neutral-800 text-neutral-300"
                )}
              >
                {cat}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3 pb-20">
        {entries.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center opacity-50">
            <Feather size={48} className="mb-4 text-orange-700 dark:text-orange-500" />
            <p className="font-serif text-lg">Страницы пусты.<br/>Архивариус ждет ваших открытий.</p>
          </div>
        ) : filteredEntries.length === 0 ? (
          <p className="text-center py-8 font-serif opacity-50">В архивах нет упоминаний об этом.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {filteredEntries.map(entry => (
              <button 
                key={entry.id} 
                onClick={() => setSelectedEntry(entry)}
                className={cn(
                  "text-left border rounded-xl p-4 transition-all hover:scale-[1.02] active:scale-[0.98] flex flex-col gap-2",
                  appSettings.theme === 'light' ? "bg-[#fdfbf7] border-[#d3c5a3] shadow-sm hover:shadow-md" : "bg-neutral-900 border-neutral-800 hover:border-neutral-700"
                )}
              >
                <div className="flex justify-between items-start">
                  <h2 className="text-lg font-bold font-serif text-orange-700 dark:text-orange-500 leading-tight">{entry.title}</h2>
                  {entry.level && (
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-neutral-200 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400">
                      LVL {entry.level}
                    </span>
                  )}
                </div>
                
                {entry.category && (
                  <div className="flex items-center gap-2">
                    <p className="text-xs uppercase tracking-wider opacity-60 font-semibold">{entry.category}</p>
                    {entry.nature && (
                      <span className={cn(
                        "text-[9px] px-1.5 py-0.5 rounded border",
                        entry.nature === 'positive' ? "bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-400 border-green-200 dark:border-green-800/50" :
                        entry.nature === 'negative' ? "bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-400 border-red-200 dark:border-red-800/50" :
                        "bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 border-neutral-200 dark:border-neutral-700"
                      )}>
                        {entry.nature === 'positive' ? 'Благотворное' : entry.nature === 'negative' ? 'Вредоносное' : 'Нейтральное'}
                      </span>
                    )}
                  </div>
                )}

                {entry.tags && entry.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {entry.tags.slice(0, 3).map(tag => (
                      <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded-sm bg-orange-100 dark:bg-orange-900/30 text-orange-800 dark:text-orange-400">
                        {tag}
                      </span>
                    ))}
                    {entry.tags.length > 3 && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-sm bg-neutral-100 dark:bg-neutral-800 text-neutral-500">
                        +{entry.tags.length - 3}
                      </span>
                    )}
                  </div>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
