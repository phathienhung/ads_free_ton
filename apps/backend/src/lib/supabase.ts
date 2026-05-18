import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// Ensure env is loaded even if main.ts hasn't run it yet (for local tests)
dotenv.config();
dotenv.config({ path: '../../.env' });

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseKey) {
  console.warn('Supabase credentials missing. Database operations will fail.');
}

export const supabase = createClient(supabaseUrl, supabaseKey);
