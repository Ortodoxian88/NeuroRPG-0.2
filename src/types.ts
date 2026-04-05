import { Timestamp } from "firebase/firestore";

export interface UserProfile {
  currentRoomId: string | null;
}

export interface Room {
  id: string;
  hostId: string;
  scenario: string;
  turn: number;
  status: 'lobby' | 'playing';
  quests: string[];
  currentRoll?: { playerUid: string; playerName: string; value: number; timestamp: number } | null;
  isGenerating?: boolean;
  createdAt: Timestamp;
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
  action: string;
  isHiddenAction?: boolean;
  isReady: boolean;
  joinedAt: Timestamp;
}

export interface Message {
  id: string;
  role: 'system' | 'ai' | 'players' | 'player';
  content: string;
  playerName?: string;
  playerUid?: string;
  isHidden?: boolean;
  turn: number;
  createdAt: Timestamp;
}

export interface BestiaryEntry {
  id?: string;
  title: string;
  content: string;
  discoveredAt: any;
}
