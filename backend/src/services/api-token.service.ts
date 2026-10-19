import { CLIENT_KEY, CLIENT_SECRET } from '@config';
import { HttpException } from '@exceptions/HttpException';
import { logger } from '@utils/logger';
import { getRedisClient } from '@utils/redis';
import { apiURL } from '@utils/util';
import axios from 'axios';
import qs from 'qs';

interface Token {
  access_token: string;
  expires_in: number;
}

const REDIS_TOKEN_KEY = 'wso2:access_token';
const REDIS_EXPIRES_KEY = 'wso2:token_expires';
const REDIS_LOCK_KEY = 'wso2:token_lock';
const LOCK_TTL_SECONDS = 10;
const LOCK_WAIT_MS = 500;
const LOCK_MAX_RETRIES = 5;

// In-memory fallback only for local dev (no REDIS_HOST)
let localAccessToken = '';
let localTokenExpires = 0;

class ApiTokenService {
  public async getToken(): Promise<string> {
    const redis = await getRedisClient();

    if (redis) {
      return this.getTokenFromRedis(redis);
    }

    // Local dev fallback (no Redis)
    if (Date.now() < localTokenExpires && localAccessToken) {
      return localAccessToken;
    }

    return this.fetchTokenLocal();
  }

  private async getTokenFromRedis(redis: Awaited<ReturnType<typeof getRedisClient>> & {}): Promise<string> {
    const [token, expires] = await Promise.all([redis.get(REDIS_TOKEN_KEY), redis.get(REDIS_EXPIRES_KEY)]);

    if (token && expires && Date.now() < Number(expires)) {
      return token;
    }

    // Try to acquire lock so only one pod fetches a new token
    const acquired = await redis.set(REDIS_LOCK_KEY, '1', { NX: true, EX: LOCK_TTL_SECONDS });

    if (acquired) {
      try {
        logger.info('Acquired token lock, fetching new OAuth token');
        const newToken = await this.fetchTokenToRedis(redis);
        return newToken;
      } finally {
        await redis.del(REDIS_LOCK_KEY).catch(() => {});
      }
    }

    // Another pod is fetching — wait and read from Redis
    logger.info('Token lock held by another pod, waiting...');
    for (let attempt = 0; attempt < LOCK_MAX_RETRIES; attempt++) {
      await this.sleep(LOCK_WAIT_MS);
      const [waitToken, waitExpires] = await Promise.all([redis.get(REDIS_TOKEN_KEY), redis.get(REDIS_EXPIRES_KEY)]);
      if (waitToken && waitExpires && Date.now() < Number(waitExpires)) {
        return waitToken;
      }
    }

    // Lock timed out without a valid token — fetch ourselves
    logger.warn('Token lock wait timed out, fetching token directly');
    return this.fetchTokenToRedis(redis);
  }

  private async fetchTokenToRedis(redis: Awaited<ReturnType<typeof getRedisClient>> & {}): Promise<string> {
    const token = await this.fetchFromWso2();
    const expiresAt = Date.now() + (token.expires_in * 1000 - 10000);
    const ttlSeconds = Math.max(1, token.expires_in - 10);

    await redis.set(REDIS_TOKEN_KEY, token.access_token, { EX: ttlSeconds });
    await redis.set(REDIS_EXPIRES_KEY, String(expiresAt), { EX: ttlSeconds });
    logger.info(`Token cached in Redis, valid for ${token.expires_in}s`);

    return token.access_token;
  }

  private async fetchTokenLocal(): Promise<string> {
    const token = await this.fetchFromWso2();
    localAccessToken = token.access_token;
    localTokenExpires = Date.now() + (token.expires_in * 1000 - 10000);
    return localAccessToken;
  }

  private async fetchFromWso2(): Promise<Token> {
    const authString = Buffer.from(`${CLIENT_KEY}:${CLIENT_SECRET}`, 'utf-8').toString('base64');

    try {
      const { data } = await axios({
        method: 'POST',
        headers: {
          Authorization: 'Basic ' + authString,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        data: qs.stringify({
          grant_type: 'client_credentials',
        }),
        url: apiURL('token'),
      });
      const token = data as Token;

      if (!token) throw new HttpException(502, 'Bad Gateway');

      logger.info(`Token valid for: ${token.expires_in}s`);
      logger.info(`Token expires at: ${new Date(Date.now() + token.expires_in * 1000).toISOString()}`);

      return token;
    } catch (error) {
      console.error('failed to fetch access token', error);
      throw new HttpException(502, 'Bad Gateway');
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export default ApiTokenService;
