import { RedisStore } from 'connect-redis';
import session from 'express-session';
import createFileStore from 'session-file-store';

import { logger } from './logger';
import { getRedisClient } from './redis';

const SESSION_TTL = 12 * 60 * 60;

export async function createSessionStore(): Promise<session.Store> {
  const redisClient = await getRedisClient();

  if (redisClient) {
    logger.info('Using Redis session store');
    return new RedisStore({ client: redisClient, prefix: 'sess:', ttl: SESSION_TTL });
  }

  if (process.env.REDIS_HOST) {
    throw new Error('REDIS_HOST is set but Redis connection failed. Refusing to fall back to file-based sessions.');
  }

  const FileStore = createFileStore(session);
  logger.info('Using file-based session store (no REDIS_HOST)');
  return new FileStore({ ttl: SESSION_TTL, path: './data/sessions' });
}
