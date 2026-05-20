import { supabase } from './supabase';
import { redis } from './redis';

export interface EnergyParams {
  maxEnergy: number;
  recoverSeconds: number;
  recoverAmount: number;
}

export interface LevelingParams {
  initialMaxXp: number;
  xpStepPerLevel: number;
  energyBonusPerLevel: number;
}

export interface WithdrawalFee {
  rate: number;
  minFee: number;
}

const CACHE_TTL = 300; // 5 minutes

export async function getGameConfig<T>(key: string): Promise<T> {
  const cacheKey = `game_config:${key}`;
  
  // Try cache
  const cached = await redis.get(cacheKey);
  if (cached) return JSON.parse(cached);

  // Fetch from DB
  const { data, error } = await supabase
    .from('GameConfig')
    .select('value')
    .eq('key', key)
    .single();

  if (error || !data) {
    console.error(`Config key ${key} not found, using defaults`);
    // Return sensible defaults if key missing
    if (key === 'energy_params') return { maxEnergy: 100, recoverSeconds: 60, recoverAmount: 1 } as any;
    if (key === 'leveling_params') return { initialMaxXp: 100, xpStepPerLevel: 50, energyBonusPerLevel: 5 } as any;
    throw new Error(`Config ${key} missing and no default available`);
  }

  const value = data.value as T;
  
  // Cache result
  await redis.set(cacheKey, JSON.stringify(value), 'EX', CACHE_TTL);
  
  return value;
}
