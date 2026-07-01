import { Redis } from "@upstash/redis";

const SESSION_TTL_SECONDS = 30 * 60;

interface SessionStore {
  get<T>(id: string): Promise<T | null>;
  set<T>(id: string, value: T): Promise<void>;
  delete(id: string): Promise<void>;
}

class MemorySessionStore implements SessionStore {
  private readonly data = new Map<string, unknown>();

  async get<T>(id: string): Promise<T | null> {
    return (this.data.get(id) as T | undefined) ?? null;
  }

  async set<T>(id: string, value: T): Promise<void> {
    this.data.set(id, value);
  }

  async delete(id: string): Promise<void> {
    this.data.delete(id);
  }
}

class RedisSessionStore implements SessionStore {
  private readonly redis: Redis;

  constructor(redis: Redis) {
    this.redis = redis;
  }

  private key(id: string): string {
    return `grade:${id}`;
  }

  async get<T>(id: string): Promise<T | null> {
    return this.redis.get<T>(this.key(id));
  }

  async set<T>(id: string, value: T): Promise<void> {
    await this.redis.set(this.key(id), value, { ex: SESSION_TTL_SECONDS });
  }

  async delete(id: string): Promise<void> {
    await this.redis.del(this.key(id));
  }
}

let store: SessionStore | null = null;

function hasRedisEnv(): boolean {
  return Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
}

export function getSessionStore(): SessionStore {
  if (store) return store;

  if (hasRedisEnv()) {
    store = new RedisSessionStore(
      new Redis({
        url: process.env.KV_REST_API_URL!,
        token: process.env.KV_REST_API_TOKEN!,
      }),
    );
  } else {
    store = new MemorySessionStore();
  }

  return store;
}

/** @internal test helper */
export function resetSessionStoreForTests(): void {
  store = null;
}
