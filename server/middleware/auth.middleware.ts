import { Request, Response, NextFunction } from 'express';
import { createClient } from '@supabase/supabase-js';
import { usersRepository } from '../database/repositories/users.repository';

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || '';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

export async function authMiddleware(req: Request, res: Response, next: NextFunction) {
  try {
    let token = '';
    const authHeader = req.headers.authorization;
    
    if (authHeader?.startsWith('Bearer ')) {
      token = authHeader.split('Bearer ')[1];
    } else if (req.query.token && typeof req.query.token === 'string') {
      token = req.query.token;
    }

    if (!token) {
      return res.status(401).json({ error: 'Missing token' });
    }

    const { data: { user: supabaseUser }, error } = await supabase.auth.getUser(token);
    
    if (error || !supabaseUser) {
      console.error('[Auth] Supabase Auth Error:', error);
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // UPSERT юзера в нашу БД
    const user = await usersRepository.upsertByGoogleId({
      googleId: supabaseUser.id,
      email: supabaseUser.email || '',
      displayName: supabaseUser.user_metadata?.full_name || supabaseUser.email?.split('@')[0] || 'Unknown Traveler',
      avatarUrl: supabaseUser.user_metadata?.avatar_url || null
    });

    req.user = user;
    next();
  } catch (error) {
    console.error('[Auth] Middleware Error:', error);
    res.status(401).json({ error: 'Unauthorized' });
  }
}
