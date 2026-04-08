import { query } from '../client';
import { ArchivistQueueRow } from '../types';

export const archivistRepository = {
  async enqueue(roomId: string, candidate: any): Promise<ArchivistQueueRow> {
    const res = await query<ArchivistQueueRow>(
      `INSERT INTO archivist_queue (room_id, candidate, status, attempts)
       VALUES ($1, $2, 'pending', 0) RETURNING *`,
      [roomId, candidate]
    );
    return res.rows[0];
  },

  async getPending(limit: number = 10): Promise<ArchivistQueueRow[]> {
    const res = await query<ArchivistQueueRow>(
      `SELECT * FROM archivist_queue WHERE status = 'pending' ORDER BY id ASC LIMIT $1`,
      [limit]
    );
    return res.rows;
  },

  async updateStatus(id: string, status: string, lastError: string | null = null, bestiaryId: string | null = null): Promise<ArchivistQueueRow | null> {
    const res = await query<ArchivistQueueRow>(
      `UPDATE archivist_queue 
       SET status = $1, last_error = $2, bestiary_id = $3, attempts = attempts + 1 
       WHERE id = $4 RETURNING *`,
      [status, lastError, bestiaryId, id]
    );
    return res.rows[0] || null;
  }
};
