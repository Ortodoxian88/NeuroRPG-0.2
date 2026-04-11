import { query } from '../client';
import { RoomRow } from '../types';

export const roomsRepository = {
  async createRoom(hostUserId: string, worldSettings: any): Promise<RoomRow> {
    // Generate exactly 6 uppercase alphanumeric characters
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let joinCode = '';
    for (let i = 0; i < 6; i++) {
      joinCode += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    
    const sql = `
      INSERT INTO rooms (host_user_id, join_code, status, turn_number, turn_status, story_summary, world_settings, active_quests, created_at, updated_at)
      VALUES ($1, $2, 'lobby', 0, 'waiting', '', $3, '[]', NOW(), NOW())
      RETURNING *;
    `;
    const res = await query<any>(sql, [hostUserId, joinCode, JSON.stringify(worldSettings || {})]);
    
    // Fetch with external_host_id
    return this.findById(res.rows[0].id);
  },

  async findById(id: string): Promise<any | null> {
    const sql = `
      SELECT r.*, u.google_id as external_host_id
      FROM rooms r
      JOIN users u ON r.host_user_id = u.id
      WHERE r.id = $1::uuid
    `;
    const res = await query<any>(sql, [id]);
    return res.rows[0] || null;
  },

  async findByJoinCode(joinCode: string): Promise<any | null> {
    const sql = `
      SELECT r.*, u.google_id as external_host_id
      FROM rooms r
      JOIN users u ON r.host_user_id = u.id
      WHERE r.join_code = $1
    `;
    const res = await query<any>(sql, [joinCode]);
    return res.rows[0] || null;
  },

  async updateStatus(id: string, status: string): Promise<void> {
    await query('UPDATE rooms SET status = $1, updated_at = NOW() WHERE id = $2', [status, id]);
  },

  async updateTurn(id: string, turnNumber: number, turnStatus: string, storySummary: string): Promise<void> {
    await query('UPDATE rooms SET turn_number = $1, turn_status = $2, story_summary = $3, updated_at = NOW() WHERE id = $4', [turnNumber, turnStatus, storySummary, id]);
  }
};
