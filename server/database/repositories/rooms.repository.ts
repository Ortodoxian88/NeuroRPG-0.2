import { query, withTransaction } from '../client';
import { RoomRow } from '../types';

const ADJECTIVES = ['DARK', 'IRON', 'FIRE', 'FROST', 'WILD', 'BLOOD', 'SHADOW', 'STORM', 'VOID', 'DOOM'];
const NOUNS = ['WOLF', 'BEAR', 'DRAGON', 'RAVEN', 'SNAKE', 'LION', 'TIGER', 'EAGLE', 'SHARK', 'GHOST'];

export function generateJoinCode(): string {
  const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
  const num = Math.floor(Math.random() * 90) + 10; // 10-99
  return `${adj}-${noun}-${num}`;
}

export const roomsRepository = {
  async createRoom(hostUserId: string, worldSettings: any): Promise<RoomRow> {
    let joinCode = '';
    let isUnique = false;
    let attempts = 0;

    // Пытаемся сгенерировать уникальный код (максимум 10 попыток)
    while (!isUnique && attempts < 10) {
      joinCode = generateJoinCode();
      const existing = await this.findByJoinCode(joinCode);
      if (!existing) {
        isUnique = true;
      }
      attempts++;
    }

    if (!isUnique) {
      throw new Error('Failed to generate a unique join code after 10 attempts');
    }

    const res = await query<RoomRow>(
      `INSERT INTO rooms (host_user_id, join_code, status, turn_number, turn_status, world_settings, active_quests, story_summary)
       VALUES ($1, $2, 'lobby', 0, 'waiting', $3, '[]', '') RETURNING *`,
      [hostUserId, joinCode, worldSettings]
    );
    return res.rows[0];
  },

  async findById(id: string): Promise<RoomRow | null> {
    const res = await query<RoomRow>('SELECT * FROM rooms WHERE id = $1', [id]);
    return res.rows[0] || null;
  },

  async findByJoinCode(joinCode: string): Promise<RoomRow | null> {
    const res = await query<RoomRow>('SELECT * FROM rooms WHERE join_code = $1', [joinCode]);
    return res.rows[0] || null;
  },

  async updateStatus(id: string, status: string): Promise<RoomRow | null> {
    const res = await query<RoomRow>(
      'UPDATE rooms SET status = $1 WHERE id = $2 RETURNING *',
      [status, id]
    );
    return res.rows[0] || null;
  },

  async updateTurn(id: string, turnNumber: number, turnStatus: string, storySummary: string): Promise<RoomRow | null> {
    const res = await query<RoomRow>(
      'UPDATE rooms SET turn_number = $1, turn_status = $2, story_summary = $3 WHERE id = $4 RETURNING *',
      [turnNumber, turnStatus, storySummary, id]
    );
    return res.rows[0] || null;
  },

  async updateQuests(id: string, activeQuests: any): Promise<RoomRow | null> {
    const res = await query<RoomRow>(
      'UPDATE rooms SET active_quests = $1 WHERE id = $2 RETURNING *',
      [activeQuests, id]
    );
    return res.rows[0] || null;
  }
};
