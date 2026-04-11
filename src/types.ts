export interface UserProfile {
  currentRoomId: string | null;
}

export interface Room {
  id: string;
  joinCode: string;
  hostId: string;
  scenario: string;
  turn: number;
  status: 'lobby' | 'playing';
  quests: string[];
  currentRoll?: { playerUid: string; playerName: string; value: number; timestamp: number } | null;
  isGenerating?: boolean;
  storySummary?: string;
  lastSummaryTurn?: number;
  worldState?: string; // Dynamic compendium/economy state
  factions?: Record<string, string>; // Faction relations and status
  hiddenTimers?: Record<string, number>; // Quest timers (e.g., "Save hostage": 3 turns left)
  createdAt: string | Date;
}

export interface Player {
  uid: string;
  name: string;
  profile: string;
  inventory: string[];
  skills: string[];
  hp: number;
  maxHp: number;
  mana: number;
  maxMana: number;
  stress?: number; // 0-100 psychological stress
  alignment?: string; // e.g., "Хаотично-Добрый"
  injuries?: string[]; // Permanent or semi-permanent injuries
  statuses?: string[]; // Temporary effects (Poisoned, Bleeding, Buffed)
  mutations?: string[]; // Hidden or visible curses/mutations
  reputation?: Record<string, number>; // Faction/NPC standing (-100 to 100)
  stats?: {
    speed: number; // Скорость передвижения
    reaction: number; // Скорость реакции
    strength: number; // Сила на подъём
    power: number; // Разрушительная сила
    durability: number; // Прочность
    stamina: number; // Выносливость
  };
  action: string;
  isHiddenAction?: boolean;
  isReady: boolean;
  joinedAt: string | Date;
}

export interface AppSettings {
  goreLevel: 'low' | 'medium' | 'high';
  gmTone?: 'classic' | 'grimdark' | 'horror' | 'epic';
  difficulty?: 'normal' | 'hard' | 'hardcore';
  theme: 'light' | 'dark' | 'black';
  language: 'ru' | 'en';
  soundEffects: boolean;
  vibration: boolean;
  animations: boolean;
  performanceMode: boolean;
  localMusicUrl?: string;
}

export interface ChatSettings {
  fontFamily: 'sans' | 'serif' | 'mono' | 'dyslexic'; // 1, 5
  fontSize: 'sm' | 'md' | 'lg'; // 2
  lineHeight: 'tight' | 'normal' | 'loose'; // 3
  tracking: 'tight' | 'normal' | 'wide'; // 4
  boldNames: boolean; // 6
  italicActions: boolean; // 7
  highlightKeywords: boolean; // 8
  textAlign: 'left' | 'justify'; // 9
  autoCapitalize: boolean; // 10
  typewriterSpeed: number; // 11
  messageStyle: 'bubbles' | 'plain'; // 13
  compactMode: boolean; // 14
  showTimestamps: boolean; // 15
  avatarSize: 'hidden' | 'sm' | 'md' | 'lg'; // 16
  hideSystemMessages: boolean; // 17
  playerColors: boolean; // 21
  aiTextColor: 'default' | 'gold' | 'purple' | 'green'; // 22
  borderStyle: 'sharp' | 'rounded' | 'fantasy'; // 26
  shadowIntensity: 'none' | 'sm' | 'md' | 'lg'; // 27
  linkColor: 'blue' | 'orange' | 'purple'; // 28
  whisperColor: 'gray' | 'purple' | 'blue'; // 29
  errorColor: 'red' | 'orange'; // 30
  autoScroll: boolean; // 31
  smoothScroll: boolean; // 32
  enableMarkdown: boolean; // 40
  focusMode: boolean; // 48
}

export interface Message {
  id: string;
  role: 'system' | 'ai' | 'players' | 'player';
  content: string;
  reasoning?: string;
  playerName?: string;
  playerUid?: string;
  isHidden?: boolean;
  turn: number;
  createdAt: string | Date;
}

export interface BestiaryEntry {
  id?: string;
  title: string;
  category: string;
  nature?: 'positive' | 'negative' | 'neutral';
  tags: string[];
  level: number; // 1, 2, 3 (knowledge level)
  content: string;
  authorNotes?: string;
  roomId: string;
  discoveredBy: string;
  discoveredAt: any;
  updatedAt?: any;
}

export interface WikiCandidate {
  name: string;
  rawFacts: string;
  reason: string;
}
