import React, { useState } from 'react';
import { AppSettings, ChatSettings } from '@/src/types';
import { X, Globe, MessageSquare, Monitor, Type, Palette, Zap, ShieldAlert, Info, Trash2, Bug } from 'lucide-react';
import { cn } from '@/src/lib/utils';

interface SettingsViewProps {
  appSettings: AppSettings;
  setAppSettings: (settings: AppSettings) => void;
  chatSettings: ChatSettings;
  setChatSettings: (settings: ChatSettings) => void;
  onClose: () => void;
}

export default function SettingsView({
  appSettings,
  setAppSettings,
  chatSettings,
  setChatSettings,
  onClose
}: SettingsViewProps) {
  const [activeTab, setActiveTab] = useState<'global' | 'chat'>('global');

  const updateApp = (key: keyof AppSettings, value: any) => {
    setAppSettings({ ...appSettings, [key]: value });
  };

  const updateChat = (key: keyof ChatSettings, value: any) => {
    setChatSettings({ ...chatSettings, [key]: value });
  };

  return (
    <div className={cn(
      "flex-1 flex flex-col h-full overflow-hidden",
      appSettings.theme === 'light' ? "bg-neutral-50" : "bg-black"
    )}>
      {/* Header */}
      <div className={cn(
        "flex-none p-6 border-b flex justify-between items-center",
        appSettings.theme === 'light' ? "bg-white border-neutral-200" : "bg-neutral-950 border-neutral-900"
      )}>
        <div>
          <h2 className={cn(
            "text-2xl font-bold font-display tracking-tight",
            appSettings.theme === 'light' ? "text-neutral-900" : "text-white"
          )}>Настройки</h2>
          <p className="text-xs text-neutral-500 font-medium uppercase tracking-widest mt-1">Конфигурация системы</p>
        </div>
        <button 
          onClick={onClose}
          className={cn(
            "p-3 rounded-2xl transition-all",
            appSettings.theme === 'light' ? "text-neutral-400 hover:text-neutral-900 hover:bg-neutral-100" : "text-neutral-500 hover:text-white hover:bg-neutral-900"
          )}
        >
          <X size={24} />
        </button>
      </div>

      {/* Tabs */}
      <div className={cn(
        "flex-none px-6 pt-4 flex gap-2 border-b",
        appSettings.theme === 'light' ? "bg-white border-neutral-200" : "bg-neutral-950 border-neutral-900"
      )}>
        <button
          onClick={() => setActiveTab('global')}
          className={cn(
            "px-6 py-4 text-sm font-bold uppercase tracking-wider rounded-t-xl transition-colors flex items-center gap-2",
            activeTab === 'global' 
              ? (appSettings.theme === 'light' ? "bg-neutral-100 text-neutral-900" : "bg-neutral-900 text-white") 
              : "text-neutral-500 hover:text-neutral-300"
          )}
        >
          <Globe size={18} /> Общие
        </button>
        <button
          onClick={() => setActiveTab('chat')}
          className={cn(
            "px-6 py-4 text-sm font-bold uppercase tracking-wider rounded-t-xl transition-colors flex items-center gap-2",
            activeTab === 'chat' 
              ? (appSettings.theme === 'light' ? "bg-neutral-100 text-neutral-900" : "bg-neutral-900 text-white") 
              : "text-neutral-500 hover:text-neutral-300"
          )}
        >
          <MessageSquare size={18} /> Чат
        </button>
      </div>

      {/* Content */}
      <div className={cn(
        "flex-1 overflow-y-auto p-6",
        appSettings.theme === 'light' ? "bg-neutral-50" : "bg-neutral-900/30"
      )}>
        <div className="max-w-3xl mx-auto space-y-8 pb-12">
          
          {activeTab === 'global' && (
            <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-300">
              
              <Section title="Геймплей и Атмосфера" icon={<ShieldAlert size={18} />} appSettings={appSettings}>
                <SelectField 
                  label="Тон Гейм-мастера" 
                  value={appSettings.gmTone || 'classic'} 
                  onChange={(v) => updateApp('gmTone', v)}
                  options={[
                    { value: 'classic', label: 'Классическое фэнтези' },
                    { value: 'grimdark', label: 'Гримдарк (Мрачное)' },
                    { value: 'horror', label: 'Лавкрафтовский ужас' },
                    { value: 'epic', label: 'Эпическая сага' }
                  ]}
                  appSettings={appSettings}
                />
                <SelectField 
                  label="Сложность" 
                  value={appSettings.difficulty || 'normal'} 
                  onChange={(v) => updateApp('difficulty', v)}
                  options={[
                    { value: 'normal', label: 'Нормальная (Сбалансированная)' },
                    { value: 'hard', label: 'Высокая (Сложная)' },
                    { value: 'hardcore', label: 'Хардкор (Смертельная)' }
                  ]}
                  appSettings={appSettings}
                />
                <SelectField 
                  label="Уровень жестокости (Gore)" 
                  value={appSettings.goreLevel} 
                  onChange={(v) => updateApp('goreLevel', v)}
                  options={[
                    { value: 'low', label: 'Низкий (PG-13)' },
                    { value: 'medium', label: 'Средний (Стандарт)' },
                    { value: 'high', label: 'Высокий (Рейтинг R)' }
                  ]}
                  appSettings={appSettings}
                />
              </Section>

              <Section title="Интерфейс" icon={<Monitor size={18} />} appSettings={appSettings}>
                <SelectField 
                  label="Тема приложения" 
                  value={appSettings.theme} 
                  onChange={(v) => updateApp('theme', v)}
                  options={[
                    { value: 'light', label: 'Светлая' },
                    { value: 'dark', label: 'Темная' },
                    { value: 'black', label: 'Фулл Блэк (OLED)' }
                  ]}
                  appSettings={appSettings}
                />
                <SelectField 
                  label="Язык интерфейса" 
                  value={appSettings.language} 
                  onChange={(v) => updateApp('language', v)}
                  options={[
                    { value: 'ru', label: 'Русский' },
                    { value: 'en', label: 'English' }
                  ]}
                  appSettings={appSettings}
                />
              </Section>
              
              <Section title="Эффекты и Обратная связь" icon={<Zap size={18} />} appSettings={appSettings}>
                <ToggleField label="Звуковые эффекты" value={appSettings.soundEffects} onChange={(v) => updateApp('soundEffects', v)} appSettings={appSettings} />
                <ToggleField label="Вибрация (Haptic)" value={appSettings.vibration} onChange={(v) => updateApp('vibration', v)} appSettings={appSettings} />
                <ToggleField label="Анимации интерфейса" value={appSettings.animations} onChange={(v) => updateApp('animations', v)} appSettings={appSettings} />
                <ToggleField label="Режим производительности" value={appSettings.performanceMode} onChange={(v) => updateApp('performanceMode', v)} appSettings={appSettings} />
                
                <div className={cn(
                  "flex flex-col gap-3 p-4 border rounded-2xl",
                  appSettings.theme === 'light' ? "bg-white border-neutral-200 shadow-sm" : "bg-neutral-950 border-neutral-800"
                )}>
                  <label className={cn(
                    "text-base font-bold",
                    appSettings.theme === 'light' ? "text-neutral-700" : "text-neutral-300"
                  )}>Локальная фоновая музыка (URL)</label>
                  <p className="text-xs text-neutral-500">Вставьте прямую ссылку на аудиофайл (mp3, wav), чтобы он играл на фоне только для вас.</p>
                  <input 
                    type="text"
                    value={appSettings.localMusicUrl || ''}
                    onChange={(e) => updateApp('localMusicUrl', e.target.value)}
                    placeholder="https://example.com/music.mp3"
                    className={cn(
                      "w-full border text-base rounded-xl px-4 py-3 outline-none focus:border-orange-500 transition-colors",
                      appSettings.theme === 'light' ? "bg-neutral-50 border-neutral-200 text-neutral-900" : "bg-neutral-900 border-neutral-700 text-white"
                    )}
                  />
                </div>
              </Section>

              <Section title="Система" icon={<Bug size={18} />} appSettings={appSettings}>
                <button 
                  onClick={() => window.location.reload()}
                  className={cn(
                    "w-full flex items-center justify-between p-4 rounded-2xl border transition-colors group",
                    appSettings.theme === 'light' 
                      ? "bg-white border-neutral-200 hover:border-red-500/50 shadow-sm" 
                      : "bg-neutral-950 border-neutral-800 hover:border-red-500/50"
                  )}
                >
                  <div className="flex items-center gap-3">
                    <Trash2 size={20} className="text-neutral-500 group-hover:text-red-500" />
                    <span className={cn(
                      "text-base font-bold group-hover:text-red-500",
                      appSettings.theme === 'light' ? "text-neutral-700" : "text-neutral-300"
                    )}>Очистить кэш данных</span>
                  </div>
                  <span className="text-[10px] text-neutral-500 uppercase tracking-widest font-bold">Сброс</span>
                </button>
              </Section>

              <div className="pt-12 pb-4 flex flex-col items-center justify-center text-neutral-500 space-y-2">
                <div className={cn(
                  "w-12 h-12 rounded-2xl flex items-center justify-center mb-2",
                  appSettings.theme === 'light' ? "bg-neutral-200" : "bg-neutral-900"
                )}>
                  <Zap size={24} className={appSettings.theme === 'light' ? "text-neutral-400" : "text-neutral-700"} />
                </div>
                <p className="text-sm font-bold tracking-widest uppercase">NeuroRPG</p>
                <p className="text-xs font-mono">Версия 0.3.0 (Build 42)</p>
              </div>
            </div>
          )}

          {activeTab === 'chat' && (
            <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-300">
              
              <Section title="Типографика и Текст" icon={<Type size={18} />} appSettings={appSettings}>
                <SelectField 
                  label="Семейство шрифтов" 
                  value={chatSettings.fontFamily} 
                  onChange={(v) => updateChat('fontFamily', v)}
                  options={[
                    { value: 'sans', label: 'Modern (Sans)' },
                    { value: 'serif', label: 'Classic (Serif)' },
                    { value: 'mono', label: 'Technical (Mono)' },
                    { value: 'dyslexic', label: 'OpenDyslexic' }
                  ]}
                  appSettings={appSettings}
                />
                <SelectField 
                  label="Размер шрифта" 
                  value={chatSettings.fontSize} 
                  onChange={(v) => updateChat('fontSize', v)}
                  options={[
                    { value: 'sm', label: 'Мелкий' },
                    { value: 'md', label: 'Средний' },
                    { value: 'lg', label: 'Крупный' }
                  ]}
                  appSettings={appSettings}
                />
                <div className="grid grid-cols-2 gap-4">
                  <SelectField 
                    label="Высота строки" 
                    value={chatSettings.lineHeight} 
                    onChange={(v) => updateChat('lineHeight', v)}
                    options={[
                      { value: 'tight', label: 'Плотная' },
                      { value: 'normal', label: 'Обычная' },
                      { value: 'loose', label: 'Свободная' }
                    ]}
                    appSettings={appSettings}
                  />
                  <SelectField 
                    label="Интервал букв" 
                    value={chatSettings.tracking} 
                    onChange={(v) => updateChat('tracking', v)}
                    options={[
                      { value: 'tight', label: 'Узкий' },
                      { value: 'normal', label: 'Обычный' },
                      { value: 'wide', label: 'Широкий' }
                    ]}
                    appSettings={appSettings}
                  />
                </div>
                <SelectField 
                  label="Выравнивание текста" 
                  value={chatSettings.textAlign} 
                  onChange={(v) => updateChat('textAlign', v)}
                  options={[
                    { value: 'left', label: 'По левому краю' },
                    { value: 'justify', label: 'По ширине' }
                  ]}
                  appSettings={appSettings}
                />
                <div className="space-y-2 pt-2">
                  <ToggleField label="Выделять имена жирным" value={chatSettings.boldNames} onChange={(v) => updateChat('boldNames', v)} appSettings={appSettings} />
                  <ToggleField label="Действия курсивом" value={chatSettings.italicActions} onChange={(v) => updateChat('italicActions', v)} appSettings={appSettings} />
                  <ToggleField label="Подсветка ключевых слов (лут, места)" value={chatSettings.highlightKeywords} onChange={(v) => updateChat('highlightKeywords', v)} appSettings={appSettings} />
                  <ToggleField label="Авто-капитализация" value={chatSettings.autoCapitalize} onChange={(v) => updateChat('autoCapitalize', v)} appSettings={appSettings} />
                  <ToggleField label="Поддержка Markdown" value={chatSettings.enableMarkdown} onChange={(v) => updateChat('enableMarkdown', v)} appSettings={appSettings} />
                </div>
              </Section>

              <Section title="Отображение сообщений" icon={<MessageSquare size={18} />} appSettings={appSettings}>
                <SelectField 
                  label="Стиль сообщений" 
                  value={chatSettings.messageStyle} 
                  onChange={(v) => updateChat('messageStyle', v)}
                  options={[
                    { value: 'bubbles', label: 'Облачка (Мессенджер)' },
                    { value: 'plain', label: 'Сплошной текст (Книга)' }
                  ]}
                  appSettings={appSettings}
                />
                <SelectField 
                  label="Размер аватарок" 
                  value={chatSettings.avatarSize} 
                  onChange={(v) => updateChat('avatarSize', v)}
                  options={[
                    { value: 'hidden', label: 'Скрыты' },
                    { value: 'sm', label: 'Маленькие' },
                    { value: 'md', label: 'Средние' },
                    { value: 'lg', label: 'Большие' }
                  ]}
                  appSettings={appSettings}
                />
                <div className="space-y-2 pt-2">
                  <ToggleField label="Компактный режим" value={chatSettings.compactMode} onChange={(v) => updateChat('compactMode', v)} appSettings={appSettings} />
                  <ToggleField label="Показывать время (Timestamps)" value={chatSettings.showTimestamps} onChange={(v) => updateChat('showTimestamps', v)} appSettings={appSettings} />
                  <ToggleField label="Скрыть системные сообщения" value={chatSettings.hideSystemMessages} onChange={(v) => updateChat('hideSystemMessages', v)} appSettings={appSettings} />
                </div>
              </Section>

              <Section title="Цвета и Оформление" icon={<Palette size={18} />} appSettings={appSettings}>
                <SelectField 
                  label="Цвет текста ИИ" 
                  value={chatSettings.aiTextColor} 
                  onChange={(v) => updateChat('aiTextColor', v)}
                  options={[
                    { value: 'default', label: 'Стандартный' },
                    { value: 'gold', label: 'Золотой (Эпос)' },
                    { value: 'purple', label: 'Фиолетовый (Мистика)' },
                    { value: 'green', label: 'Зеленый (Яд/Хоррор)' }
                  ]}
                  appSettings={appSettings}
                />
                <div className="grid grid-cols-2 gap-4">
                  <SelectField 
                    label="Стиль границ" 
                    value={chatSettings.borderStyle} 
                    onChange={(v) => updateChat('borderStyle', v)}
                    options={[
                      { value: 'sharp', label: 'Острые' },
                      { value: 'rounded', label: 'Скругленные' },
                      { value: 'fantasy', label: 'Фэнтези рамки' }
                    ]}
                    appSettings={appSettings}
                  />
                  <SelectField 
                    label="Интенсивность теней" 
                    value={chatSettings.shadowIntensity} 
                    onChange={(v) => updateChat('shadowIntensity', v)}
                    options={[
                      { value: 'none', label: 'Плоский дизайн' },
                      { value: 'sm', label: 'Легкие' },
                      { value: 'md', label: 'Средние' },
                      { value: 'lg', label: 'Глубокие' }
                    ]}
                    appSettings={appSettings}
                  />
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <SelectField 
                    label="Цвет ссылок" 
                    value={chatSettings.linkColor} 
                    onChange={(v) => updateChat('linkColor', v)}
                    options={[{ value: 'blue', label: 'Синий' }, { value: 'orange', label: 'Оранжевый' }, { value: 'purple', label: 'Пурпурный' }]}
                    appSettings={appSettings}
                  />
                  <SelectField 
                    label="Цвет шепота" 
                    value={chatSettings.whisperColor} 
                    onChange={(v) => updateChat('whisperColor', v)}
                    options={[{ value: 'gray', label: 'Серый' }, { value: 'purple', label: 'Пурпурный' }, { value: 'blue', label: 'Синий' }]}
                    appSettings={appSettings}
                  />
                  <SelectField 
                    label="Цвет ошибок" 
                    value={chatSettings.errorColor} 
                    onChange={(v) => updateChat('errorColor', v)}
                    options={[{ value: 'red', label: 'Красный' }, { value: 'orange', label: 'Оранжевый' }]}
                    appSettings={appSettings}
                  />
                </div>
                <div className="space-y-2 pt-2">
                  <ToggleField label="Цветовое кодирование игроков" value={chatSettings.playerColors} onChange={(v) => updateChat('playerColors', v)} appSettings={appSettings} />
                </div>
              </Section>

              <Section title="Взаимодействие и Поведение" icon={<Zap size={18} />} appSettings={appSettings}>
                <div className={cn(
                  "p-4 border rounded-2xl",
                  appSettings.theme === 'light' ? "bg-white border-neutral-200 shadow-sm" : "bg-neutral-950 border-neutral-800"
                )}>
                  <div className="flex justify-between items-center mb-4">
                    <label className={cn(
                      "text-sm font-bold",
                      appSettings.theme === 'light' ? "text-neutral-700" : "text-neutral-200"
                    )}>Скорость печатной машинки</label>
                    <span className="text-xs font-mono text-orange-500 bg-orange-500/10 px-2 py-1 rounded-md">
                      {chatSettings.typewriterSpeed === 0 ? 'Мгновенно' : `${chatSettings.typewriterSpeed} мс`}
                    </span>
                  </div>
                  <input 
                    type="range" min="0" max="100" step="10"
                    value={chatSettings.typewriterSpeed}
                    onChange={(e) => updateChat('typewriterSpeed', parseInt(e.target.value))}
                    className="w-full accent-orange-500 h-2 bg-neutral-800 rounded-lg appearance-none cursor-pointer"
                  />
                </div>
                
                <div className="space-y-2 pt-2">
                  <ToggleField label="Автоскролл к новым сообщениям" value={chatSettings.autoScroll} onChange={(v) => updateChat('autoScroll', v)} appSettings={appSettings} />
                  <ToggleField label="Плавная прокрутка (Smooth scroll)" value={chatSettings.smoothScroll} onChange={(v) => updateChat('smoothScroll', v)} appSettings={appSettings} />
                  <ToggleField label="Режим фокуса (затемнять старые сообщения)" value={chatSettings.focusMode} onChange={(v) => updateChat('focusMode', v)} appSettings={appSettings} />
                </div>
              </Section>

            </div>
          )}

        </div>
      </div>
    </div>
  );
}

// --- Helper Components ---

function Section({ title, icon, children, appSettings }: { title: string, icon: React.ReactNode, children: React.ReactNode, appSettings: AppSettings }) {
  return (
    <div className="space-y-4">
      <h3 className={cn(
        "text-lg font-bold tracking-tight flex items-center gap-3 pb-3 border-b",
        appSettings.theme === 'light' ? "text-neutral-900 border-neutral-200" : "text-white border-neutral-800"
      )}>
        <span className="text-orange-500 bg-orange-500/10 p-2 rounded-xl">{icon}</span>
        {title}
      </h3>
      <div className="space-y-4">
        {children}
      </div>
    </div>
  );
}

function SelectField({ label, value, onChange, options, appSettings }: { label: string, value: string, onChange: (v: string) => void, options: {value: string, label: string}[], appSettings: AppSettings }) {
  return (
    <div className={cn(
      "flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 border rounded-2xl",
      appSettings.theme === 'light' ? "bg-white border-neutral-200 shadow-sm" : "bg-neutral-950 border-neutral-800"
    )}>
      <label className={cn(
        "text-base font-bold",
        appSettings.theme === 'light' ? "text-neutral-700" : "text-neutral-300"
      )}>{label}</label>
      <select 
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          "border text-base rounded-xl px-4 py-3 outline-none focus:border-orange-500 transition-colors cursor-pointer",
          appSettings.theme === 'light' ? "bg-neutral-50 border-neutral-200 text-neutral-900" : "bg-neutral-900 border border-neutral-700 text-white"
        )}
      >
        {options.map(opt => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
    </div>
  );
}

function ToggleField({ label, value, onChange, appSettings }: { label: string, value: boolean, onChange: (v: boolean) => void, appSettings: AppSettings }) {
  return (
    <label className={cn(
      "flex items-center justify-between p-4 border rounded-2xl cursor-pointer transition-colors group",
      appSettings.theme === 'light' 
        ? "bg-white border-neutral-200 hover:border-neutral-300 shadow-sm" 
        : "bg-neutral-950 border-neutral-800 hover:border-neutral-700"
    )}>
      <span className={cn(
        "text-base font-bold transition-colors",
        appSettings.theme === 'light' ? "text-neutral-700 group-hover:text-neutral-900" : "text-neutral-300 group-hover:text-white"
      )}>{label}</span>
      <div className={cn(
        "w-14 h-7 rounded-full transition-colors relative shrink-0",
        value ? "bg-orange-500" : "bg-neutral-800"
      )}>
        <div className={cn(
          "absolute top-1 left-1 w-5 h-5 rounded-full bg-white transition-transform",
          value ? "translate-x-7" : "translate-x-0"
        )} />
      </div>
    </label>
  );
}
