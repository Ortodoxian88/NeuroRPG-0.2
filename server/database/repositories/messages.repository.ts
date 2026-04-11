import { query } from '../client';
import { MessageRow } from '../types';

export const messagesRepository = {
  async create(data: { room_id: string, user_id: string | null, type: string, content: string, metadata: any, turn_number: number }): Promise<MessageRow> {
    const sql = `
      INSERT INTO messages (room_id, user_id, type, content, metadata, turn_number, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, NOW())
      RETURNING *;
    `;
    const res = await query<MessageRow>(sql, [data.room_id, data.user_id, data.type, data.content, JSON.stringify(data.metadata || {}), data.turn_number]);
    return res.rows[0];
  },

  async findByRoom(roomId: string, limit: number, offset: number): Promise<MessageRow[]> {
    const sql = `
      SELECT * FROM messages 
      WHERE room_id = $1 
      ORDER BY created_at ASC 
      LIMIT $2 OFFSET $3;
    `;
    const res = await query<MessageRow>(sql, [roomId, limit, offset]);
    return res.rows;
  }
};
