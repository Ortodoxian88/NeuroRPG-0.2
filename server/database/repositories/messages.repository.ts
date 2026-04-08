import { query } from '../client';
import { MessageRow } from '../types';

export interface CreateMessageDto {
  room_id: string;
  user_id: string | null;
  type: string;
  content: string;
  metadata: any | null;
  turn_number: number;
}

export const messagesRepository = {
  async create(data: CreateMessageDto): Promise<MessageRow> {
    const res = await query<MessageRow>(
      `INSERT INTO messages (room_id, user_id, type, content, metadata, turn_number)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [data.room_id, data.user_id, data.type, data.content, data.metadata, data.turn_number]
    );
    return res.rows[0];
  },

  async findByRoom(roomId: string, limit: number = 50, offset: number = 0): Promise<MessageRow[]> {
    const res = await query<MessageRow>(
      'SELECT * FROM messages WHERE room_id = $1 ORDER BY turn_number ASC, id ASC LIMIT $2 OFFSET $3',
      [roomId, limit, offset]
    );
    return res.rows;
  },
  
  async findByRoomAndTurn(roomId: string, turnNumber: number): Promise<MessageRow[]> {
    const res = await query<MessageRow>(
      'SELECT * FROM messages WHERE room_id = $1 AND turn_number = $2 ORDER BY id ASC',
      [roomId, turnNumber]
    );
    return res.rows;
  }
};
