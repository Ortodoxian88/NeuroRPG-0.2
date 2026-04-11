import { query } from '../client';
import { UserRow } from '../types';

export const usersRepository = {
  async upsertByGoogleId({ googleId, email, displayName, avatarUrl }: { googleId: string, email: string, displayName: string, avatarUrl: string | null }): Promise<UserRow> {
    const sql = `
      INSERT INTO users (google_id, email, display_name, avatar_url, last_seen_at)
      VALUES ($1, $2, $3, $4, NOW())
      ON CONFLICT (google_id) DO UPDATE SET
        email = EXCLUDED.email,
        display_name = EXCLUDED.display_name,
        avatar_url = EXCLUDED.avatar_url,
        last_seen_at = NOW()
      RETURNING *;
    `;
    const res = await query<UserRow>(sql, [googleId, email, displayName, avatarUrl]);
    return res.rows[0];
  },
  
  async findById(id: string): Promise<UserRow | null> {
    const res = await query<UserRow>('SELECT * FROM users WHERE id = $1', [id]);
    return res.rows[0] || null;
  }
};
