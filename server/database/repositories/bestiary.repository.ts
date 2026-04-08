import { query } from '../client';
import { BestiaryRow } from '../types';

export const bestiaryRepository = {
  async create(entry: Omit<BestiaryRow, 'id' | 'created_at' | 'updated_at'>): Promise<BestiaryRow> {
    const res = await query<BestiaryRow>(
      `INSERT INTO bestiary (slug, title, category, content, tags, nature, knowledge_level, source_room_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [entry.slug, entry.title, entry.category, entry.content, entry.tags, entry.nature, entry.knowledge_level, entry.source_room_id]
    );
    return res.rows[0];
  },

  async findBySlug(slug: string): Promise<BestiaryRow | null> {
    const res = await query<BestiaryRow>('SELECT * FROM bestiary WHERE slug = $1', [slug]);
    return res.rows[0] || null;
  },

  async search(searchTerm: string, category?: string): Promise<BestiaryRow[]> {
    let sql = 'SELECT * FROM bestiary WHERE (title ILIKE $1 OR content ILIKE $1)';
    const params: any[] = [`%${searchTerm}%`];
    
    if (category) {
      params.push(category);
      sql += ` AND category = $2`;
    }
    
    const res = await query<BestiaryRow>(sql, params);
    return res.rows;
  }
};
