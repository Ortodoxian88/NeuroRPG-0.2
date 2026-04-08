import { query } from '../client';
import { UserRow } from '../types';

export interface UpsertUserDto {
  googleId: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
}

export const usersRepository = {
  async upsertByGoogleId(data: UpsertUserDto): Promise<UserRow> {
    const res = await query<UserRow>(
      `INSERT INTO users (google_id, email, display_name, avatar_url, last_seen_at)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (google_id) DO UPDATE 
       SET email = EXCLUDED.email,
           display_name = EXCLUDED.display_name,
           avatar_url = EXCLUDED.avatar_url,
           last_seen_at = NOW()
       RETURNING *`,
      [data.googleId, data.email, data.displayName, data.avatarUrl]
    );
    
    if (!res.rows[0]) throw new Error('Failed to upsert user');
    return res.rows[0];
  },

  async findById(userId: string): Promise<UserRow | null> {
    const res = await query<UserRow>(
      `SELECT * FROM users WHERE id = $1`,
      [userId]
    );
    return res.rows[0] || null;
  },

  async updateLastSeen(userId: string): Promise<void> {
    await query(
      `UPDATE users SET last_seen_at = NOW() WHERE id = $1`,
      [userId]
    );
  }
};
