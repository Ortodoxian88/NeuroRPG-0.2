import { query } from '../client';
import { BestiaryRow } from '../types';

export const bestiaryRepository = {
  async search(search: string, category?: string): Promise<BestiaryRow[]> {
    let sql = 'SELECT * FROM bestiary WHERE 1=1';
    const params: any[] = [];
    
    if (search) {
      params.push(`%${search}%`);
      sql += ` AND (title ILIKE $${params.length} OR $${params.length} = ANY(tags))`;
    }
    
    if (category) {
      params.push(category);
      sql += ` AND category = $${params.length}`;
    }
    
    const res = await query<BestiaryRow>(sql, params);
    return res.rows;
  },

  async create(data: Omit<BestiaryRow, 'id' | 'created_at' | 'updated_at'>): Promise<BestiaryRow> {
    const sql = `
      INSERT INTO bestiary (slug, title, category, content, tags, nature, knowledge_level, author_notes, source_room_id, discovered_by_user_id, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW())
      RETURNING *;
    `;
    const res = await query<BestiaryRow>(sql, [
      data.slug, data.title, data.category, data.content, JSON.stringify(data.tags || []), data.nature, 
      data.knowledge_level, data.author_notes, data.source_room_id, data.discovered_by_user_id
    ]);
    return res.rows[0];
  }
};
