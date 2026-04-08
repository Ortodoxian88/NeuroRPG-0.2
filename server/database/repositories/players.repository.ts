import { query } from '../client';
import { RoomPlayerRow } from '../types';

export const playersRepository = {
  async create(player: Omit<RoomPlayerRow, 'id' | 'created_at' | 'updated_at'>): Promise<RoomPlayerRow> {
    const res = await query<RoomPlayerRow>(
      `INSERT INTO room_players 
       (room_id, user_id, character_name, character_profile, hp, hp_max, mana, mana_max, stress, stress_max, stat_strength, stat_dexterity, stat_constitution, stat_intelligence, stat_wisdom, stat_charisma, inventory, skills, statuses, injuries, current_action, is_ready, is_online, last_active_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24) RETURNING *`,
      [
        player.room_id, player.user_id, player.character_name, player.character_profile, player.hp, player.hp_max, player.mana, player.mana_max, 
        player.stress, player.stress_max, player.stat_strength, player.stat_dexterity, player.stat_constitution, player.stat_intelligence, player.stat_wisdom, player.stat_charisma, player.inventory, player.skills, player.statuses, 
        player.injuries, player.current_action, player.is_ready, player.is_online, player.last_active_at
      ]
    );
    return res.rows[0];
  },

  async findByRoomAndUser(roomId: string, userId: string): Promise<RoomPlayerRow | null> {
    const res = await query<RoomPlayerRow>(
      'SELECT * FROM room_players WHERE room_id = $1 AND user_id = $2',
      [roomId, userId]
    );
    return res.rows[0] || null;
  },

  async findByRoom(roomId: string): Promise<RoomPlayerRow[]> {
    const res = await query<RoomPlayerRow>(
      'SELECT * FROM room_players WHERE room_id = $1',
      [roomId]
    );
    return res.rows;
  },

  async updateAction(id: string, action: string | null, isReady: boolean): Promise<RoomPlayerRow | null> {
    const res = await query<RoomPlayerRow>(
      'UPDATE room_players SET current_action = $1, is_ready = $2 WHERE id = $3 RETURNING *',
      [action, isReady, id]
    );
    return res.rows[0] || null;
  },

  async updateState(id: string, stateUpdates: Partial<RoomPlayerRow>): Promise<RoomPlayerRow | null> {
    const keys = Object.keys(stateUpdates).filter(k => k !== 'id' && k !== 'created_at' && k !== 'updated_at');
    if (keys.length === 0) return null;
    
    const setClause = keys.map((k, i) => `${k} = $${i + 2}`).join(', ');
    const values = keys.map(k => (stateUpdates as any)[k]);
    
    const res = await query<RoomPlayerRow>(
      `UPDATE room_players SET ${setClause} WHERE id = $1 RETURNING *`,
      [id, ...values]
    );
    return res.rows[0] || null;
  },

  async setOnlineStatus(id: string, isOnline: boolean): Promise<void> {
    await query('UPDATE room_players SET is_online = $1 WHERE id = $2', [isOnline, id]);
  }
};
