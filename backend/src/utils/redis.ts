import { createClient, RedisClientType } from 'redis';

import { logger } from './logger';

let redisClient: RedisClientType | null = null;

export async function getRedisClient(): Promise<RedisClientType | null> {
  if (redisClient) return redisClient;

  const redisHost = process.env.REDIS_HOST;
  if (!redisHost) return null;

  const redisPassword = process.env.REDIS_PASSWORD;
  const redisPort = process.env.REDIS_PORT || '6379';

  const client = createClient({
    socket: {
      host: redisHost,
      port: Number(redisPort),
      reconnectStrategy: retries => Math.min(retries * 100, 3000),
    },
    password: redisPassword || undefined,
  }) as RedisClientType;

  client.on('error', err => logger.error(`Redis error: ${err.message}`));
  client.on('connect', () => logger.info(`Connected to Redis (${redisHost}:${redisPort})`));
  client.on('reconnecting', () => logger.info('Redis reconnecting...'));

  await client.connect();
  redisClient = client;
  return client;
}
