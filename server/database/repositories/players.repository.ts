import { query } from '../client';
import { RoomPlayerRow } from '../types';

export const playersRepository = {
  async create(data: Omit<RoomPlayerRow, 'id' | 'created_at' | 'updated_at'>): Promise<RoomPlayerRow> {
    const sql = `
      INSERT INTO room_players (
        room_id, user_id, character_name, character_profile, hp, hp_max, mana, mana_max, 
        stress, stress_max, stat_strength, stat_dexterity, stat_constitution, stat_intelligence, 
        stat_wisdom, stat_charisma, inventory, skills, statuses, injuries, alignment, mutations, 
        reputation, current_action, is_ready, is_online, last_active_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, NOW())
      RETURNING *;
    `;
    const res = await query<RoomPlayerRow>(sql, [
      data.room_id, data.user_id, data.character_name, data.character_profile, data.hp, data.hp_max, data.mana, data.mana_max,
      data.stress, data.stress_max, data.stat_strength, data.stat_dexterity, data.stat_constitution, data.stat_intelligence,
      data.stat_wisdom, data.stat_charisma, 
      JSON.stringify(data.inventory || []), 
      JSON.stringify(data.skills || []), 
      JSON.stringify(data.statuses || []), 
      JSON.stringify(data.injuries || []), 
      data.alignment, 
      JSON.stringify(data.mutations || []),
      JSON.stringify(data.reputation || {}), 
      data.current_action, data.is_ready, data.is_online
    ]);
    return res.rows[0];
  },

  async findByRoom(roomId: string): Promise<RoomPlayerRow[]> {
    const res = await query<RoomPlayerRow>('SELECT * FROM room_players WHERE room_id = $1::uuid', [roomId]);
    return res.rows;
  },

  async findByRoomAndUser(roomId: string, userId: string): Promise<RoomPlayerRow | null> {
    const res = await query<RoomPlayerRow>('SELECT * FROM room_players WHERE room_id = $1::uuid AND user_id = $2::uuid', [roomId, userId]);
    return res.rows[0] || null;
  },

  async updateAction(id: string, action: string, isReady: boolean): Promise<RoomPlayerRow> {
    const sql = `
      UPDATE room_players 
      SET current_action = $1, is_ready = $2, updated_at = NOW() 
      WHERE id = $3 
      RETURNING *;
    `;
    const res = await query<RoomPlayerRow>(sql, [action, isReady, id]);
    return res.rows[0];
  },

  async updateState(id: string, updates: Partial<RoomPlayerRow>): Promise<RoomPlayerRow> {
    // В реальном проекте здесь нужен динамический SQL билдер
    // Для простоты пока сделаем упрощенную версию
    const sql = `
      UPDATE room_players 
      SET hp = COALESCE($1, hp), mana = COALESCE($2, mana), stress = COALESCE($3, stress), 
          inventory = COALESCE($4, inventory), updated_at = NOW()
      WHERE id = $5 
      RETURNING *;
    `;
    const res = await query<RoomPlayerRow>(sql, [
      updates.hp, 
      updates.mana, 
      updates.stress, 
      updates.inventory ? JSON.stringify(updates.inventory) : null, 
      id
    ]);
    return res.rows[0];
  }
};
