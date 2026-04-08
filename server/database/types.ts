export interface UserRow {
  id: string; // uuid
  google_id: string;
  email: string;
  display_name: string;
  avatar_url: string | null;
  created_at: Date;
  last_seen_at: Date | null;
}

export interface SessionRow {
  id: string;
  user_id: string;
  token: string;
  expires_at: Date;
  created_at: Date;
}

export interface RoomRow {
  id: string;
  host_user_id: string;
  join_code: string;
  status: string;
  turn_number: number;
  turn_status: string;
  turn_started_at: Date | null;
  story_summary: string;
  world_settings: any;
  active_quests: any;
  created_at: Date;
  updated_at: Date;
}

export interface RoomPlayerRow {
  id: string;
  room_id: string;
  user_id: string;
  character_name: string;
  character_profile: string;
  hp: number;
  hp_max: number;
  mana: number;
  mana_max: number;
  stress: number;
  stress_max: number;
  stat_strength: number;
  stat_dexterity: number;
  stat_constitution: number;
  stat_intelligence: number;
  stat_wisdom: number;
  stat_charisma: number;
  inventory: any;
  skills: any;
  statuses: any;
  injuries: any;
  current_action: string | null;
  is_ready: boolean;
  is_online: boolean;
  last_active_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface MessageRow {
  id: string;
  room_id: string;
  user_id: string | null;
  type: string;
  content: string;
  metadata: any;
  turn_number: number;
  created_at: Date;
}

export interface BestiaryRow {
  id: string;
  slug: string;
  title: string;
  category: string;
  content: string;
  tags: string[];
  nature: string;
  knowledge_level: number;
  source_room_id: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface ArchivistQueueRow {
  id: string;
  room_id: string;
  candidate: any;
  status: string;
  attempts: number;
  last_error: string | null;
  bestiary_id: string | null;
  created_at: Date;
  updated_at: Date;
}

declare global {
  namespace Express {
    interface Request {
      user?: UserRow;
    }
  }
}

