import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// Ensure env is loaded even if main.ts hasn't run it yet (for local tests)
dotenv.config();
dotenv.config({ path: '../../.env' });

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('SUPABASE_URL or SUPABASE_ANON_KEY is missing in environment variables.');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
