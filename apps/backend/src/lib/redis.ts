import Redis from 'ioredis';

const stubRedis = {
  get: async () => null,
  set: async () => 'OK',
  setex: async () => 'OK',
  del: async () => 1,
  incr: async () => 1,
  expire: async () => 1,
  on: (event: string, cb: any) => {},
} as unknown as Redis;

export const redis = process.env.REDIS_URL
  ? new Redis(process.env.REDIS_URL)
  : stubRedis;

if (process.env.REDIS_URL) {
  redis.on('error', (err) => console.error('Redis Client Error', err));
  redis.on('connect', () => console.log('Redis Client Connected'));
}

// Cache helpers
export async function getCache<T>(key: string): Promise<T | null> {
  const cached = await redis.get(key);
  if (!cached) return null;
  return JSON.parse(cached) as T;
}

export async function setCache(key: string, data: unknown, ttlSeconds = 300): Promise<void> {
  await redis.set(key, JSON.stringify(data), 'EX', ttlSeconds);
}

export async function deleteCache(key: string): Promise<void> {
  await redis.del(key);
}
