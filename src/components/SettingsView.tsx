import React, { useState } from 'react';
import { AppSettings, ChatSettings } from '@/src/types';
import { X, Globe, MessageSquare, Monitor, Type, Palette, Zap, ShieldAlert, Info, Trash2 } from 'lucide-react';
import { clearFirestoreCache } from '@/src/firebase';
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
    <div className="flex-1 flex flex-col bg-black h-full overflow-hidden">
      {/* Header */}
      <div className="flex-none p-6 border-b border-neutral-900 flex justify-between items-center bg-neutral-950">
        <div>
          <h2 className="text-2xl font-bold text-white font-display tracking-tight">Настройки</h2>
          <p className="text-xs text-neutral-500 font-medium uppercase tracking-widest mt-1">Конфигурация системы</p>
        </div>
        <button 
          onClick={onClose}
          className="p-3 text-neutral-500 hover:text-white hover:bg-neutral-900 rounded-2xl transition-all"
        >
          <X size={24} />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex-none px-6 pt-4 flex gap-2 border-b border-neutral-900">
        <button
          onClick={() => setActiveTab('global')}
          className={cn(
            "px-6 py-4 text-sm font-bold uppercase tracking-wider rounded-t-xl transition-colors flex items-center gap-2",
            activeTab === 'global' ? "bg-neutral-900 text-white" : "text-neutral-500 hover:text-neutral-300"
          )}
        >
          <Globe size={18} /> Общие
        </button>
        <button
          onClick={() => setActiveTab('chat')}
          className={cn(
            "px-6 py-4 text-sm font-bold uppercase tracking-wider rounded-t-xl transition-colors flex items-center gap-2",
            activeTab === 'chat' ? "bg-neutral-900 text-white" : "text-neutral-500 hover:text-neutral-300"
          )}
        >
          <MessageSquare size={18} /> Чат
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6 bg-neutral-900/30">
        <div className="max-w-3xl mx-auto space-y-8 pb-12">
          
          {activeTab === 'global' && (
            <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-300">
              
              <Section title="Геймплей и Атмосфера" icon={<ShieldAlert size={18} />}>
                <SelectField 
                  label="Уровень жестокости (Gore)" 
                  value={appSettings.goreLevel} 
                  onChange={(v) => updateApp('goreLevel', v)}
                  options={[
                    { value: 'low', label: 'Низкий (PG-13)' },
                    { value: 'medium', label: 'Средний (Стандарт)' },
                    { value: 'high', label: 'Высокий (Рейтинг R)' }
                  ]}
                />
              </Section>

              <Section title="Интерфейс" icon={<Monitor size={18} />}>
                <SelectField 
                  label="Тема приложения" 
                  value={appSettings.theme} 
                  onChange={(v) => updateApp('theme', v)}
                  options={[
                    { value: 'light', label: 'Светлая' },
                    { value: 'dark', label: 'Темная' },
                    { value: 'black', label: 'Фулл Блэк (OLED)' }
                  ]}
                />
                <SelectField 
                  label="Язык интерфейса" 
                  value={appSettings.language} 
                  onChange={(v) => updateApp('language', v)}
                  options={[
                    { value: 'ru', label: 'Русский' },
                    { value: 'en', label: 'English' }
                  ]}
                />
              </Section>
              
              <Section title="Эффекты и Обратная связь" icon={<Zap size={18} />}>
                <ToggleField label="Звуковые эффекты" value={appSettings.soundEffects} onChange={(v) => updateApp('soundEffects', v)} />
                <ToggleField label="Вибрация (Haptic)" value={appSettings.vibration} onChange={(v) => updateApp('vibration', v)} />
                <ToggleField label="Анимации интерфейса" value={appSettings.animations} onChange={(v) => updateApp('animations', v)} />
                <ToggleField label="Режим производительности" value={appSettings.performanceMode} onChange={(v) => updateApp('performanceMode', v)} />
              </Section>

              <Section title="Система" icon={<Bug size={18} />}>
                <button 
                  onClick={clearFirestoreCache}
                  className="w-full flex items-center justify-between p-4 rounded-2xl bg-neutral-950 border border-neutral-800 hover:border-red-500/50 transition-colors group"
                >
                  <div className="flex items-center gap-3">
                    <Trash2 size={20} className="text-neutral-500 group-hover:text-red-500" />
                    <span className="text-base font-bold text-neutral-300 group-hover:text-white">Очистить кэш данных</span>
                  </div>
                  <span className="text-[10px] text-neutral-500 uppercase tracking-widest font-bold">Сброс</span>
                </button>
              </Section>

              <div className="pt-12 pb-4 flex flex-col items-center justify-center text-neutral-600 space-y-2">
                <div className="w-12 h-12 rounded-2xl bg-neutral-900 flex items-center justify-center mb-2">
                  <Zap size={24} className="text-neutral-700" />
                </div>
                <p className="text-sm font-bold tracking-widest uppercase">NeuroRPG</p>
                <p className="text-xs font-mono">Версия 0.3.0 (Build 42)</p>
              </div>
            </div>
          )}

          {activeTab === 'chat' && (
            <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-300">
              
              <Section title="Типографика и Текст" icon={<Type size={18} />}>
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
                />
                <div className="space-y-2 pt-2">
                  <ToggleField label="Выделять имена жирным" value={chatSettings.boldNames} onChange={(v) => updateChat('boldNames', v)} />
                  <ToggleField label="Действия курсивом" value={chatSettings.italicActions} onChange={(v) => updateChat('italicActions', v)} />
                  <ToggleField label="Подсветка ключевых слов (лут, места)" value={chatSettings.highlightKeywords} onChange={(v) => updateChat('highlightKeywords', v)} />
                  <ToggleField label="Авто-капитализация" value={chatSettings.autoCapitalize} onChange={(v) => updateChat('autoCapitalize', v)} />
                  <ToggleField label="Поддержка Markdown" value={chatSettings.enableMarkdown} onChange={(v) => updateChat('enableMarkdown', v)} />
                </div>
              </Section>

              <Section title="Отображение сообщений" icon={<MessageSquare size={18} />}>
                <SelectField 
                  label="Стиль сообщений" 
                  value={chatSettings.messageStyle} 
                  onChange={(v) => updateChat('messageStyle', v)}
                  options={[
                    { value: 'bubbles', label: 'Облачка (Мессенджер)' },
                    { value: 'plain', label: 'Сплошной текст (Книга)' }
                  ]}
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
                />
                <div className="space-y-2 pt-2">
                  <ToggleField label="Компактный режим" value={chatSettings.compactMode} onChange={(v) => updateChat('compactMode', v)} />
                  <ToggleField label="Показывать время (Timestamps)" value={chatSettings.showTimestamps} onChange={(v) => updateChat('showTimestamps', v)} />
                  <ToggleField label="Скрыть системные сообщения" value={chatSettings.hideSystemMessages} onChange={(v) => updateChat('hideSystemMessages', v)} />
                </div>
              </Section>

              <Section title="Цвета и Оформление" icon={<Palette size={18} />}>
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
                  />
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <SelectField 
                    label="Цвет ссылок" 
                    value={chatSettings.linkColor} 
                    onChange={(v) => updateChat('linkColor', v)}
                    options={[{ value: 'blue', label: 'Синий' }, { value: 'orange', label: 'Оранжевый' }, { value: 'purple', label: 'Пурпурный' }]}
                  />
                  <SelectField 
                    label="Цвет шепота" 
                    value={chatSettings.whisperColor} 
                    onChange={(v) => updateChat('whisperColor', v)}
                    options={[{ value: 'gray', label: 'Серый' }, { value: 'purple', label: 'Пурпурный' }, { value: 'blue', label: 'Синий' }]}
                  />
                  <SelectField 
                    label="Цвет ошибок" 
                    value={chatSettings.errorColor} 
                    onChange={(v) => updateChat('errorColor', v)}
                    options={[{ value: 'red', label: 'Красный' }, { value: 'orange', label: 'Оранжевый' }]}
                  />
                </div>
                <div className="space-y-2 pt-2">
                  <ToggleField label="Цветовое кодирование игроков" value={chatSettings.playerColors} onChange={(v) => updateChat('playerColors', v)} />
                </div>
              </Section>

              <Section title="Взаимодействие и Поведение" icon={<Zap size={18} />}>
                <div className="p-4 bg-neutral-950 border border-neutral-800 rounded-2xl">
                  <div className="flex justify-between items-center mb-4">
                    <label className="text-sm font-bold text-neutral-200">Скорость печатной машинки</label>
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
                  <ToggleField label="Автоскролл к новым сообщениям" value={chatSettings.autoScroll} onChange={(v) => updateChat('autoScroll', v)} />
                  <ToggleField label="Плавная прокрутка (Smooth scroll)" value={chatSettings.smoothScroll} onChange={(v) => updateChat('smoothScroll', v)} />
                  <ToggleField label="Режим фокуса (затемнять старые сообщения)" value={chatSettings.focusMode} onChange={(v) => updateChat('focusMode', v)} />
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

function Section({ title, icon, children }: { title: string, icon: React.ReactNode, children: React.ReactNode }) {
  return (
    <div className="space-y-4">
      <h3 className="text-sm font-black text-white uppercase tracking-widest flex items-center gap-3 pb-2 border-b border-neutral-800">
        <span className="text-orange-500">{icon}</span>
        {title}
      </h3>
      <div className="space-y-4">
        {children}
      </div>
    </div>
  );
}

function SelectField({ label, value, onChange, options }: { label: string, value: string, onChange: (v: string) => void, options: {value: string, label: string}[] }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 bg-neutral-950 border border-neutral-800 rounded-2xl">
      <label className="text-base font-bold text-neutral-300">{label}</label>
      <select 
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="bg-neutral-900 border border-neutral-700 text-white text-base rounded-xl px-4 py-3 outline-none focus:border-orange-500 transition-colors cursor-pointer"
      >
        {options.map(opt => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
    </div>
  );
}

function ToggleField({ label, value, onChange }: { label: string, value: boolean, onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center justify-between p-4 bg-neutral-950 border border-neutral-800 rounded-2xl cursor-pointer hover:border-neutral-700 transition-colors group">
      <span className="text-base font-bold text-neutral-300 group-hover:text-white transition-colors">{label}</span>
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
