import IORedis from "ioredis";
import type { ConnectionOptions } from "bullmq";

export interface QueueConfig {
  enabled: boolean;
  redisUrl?: string;
  queueName: string;
  workerConcurrency: number;
}

export function queueConfig(): QueueConfig {
  const redisUrl = process.env.REDIS_URL?.trim();
  const workerConcurrency = Number.parseInt(process.env.WORKER_CONCURRENCY ?? "1", 10);

  return {
    enabled: process.env.QUEUE_ENABLED === "true",
    redisUrl: redisUrl || undefined,
    queueName: process.env.QUEUE_NAME_LEAD_GENERATION?.trim() || "lead-generation",
    workerConcurrency:
      Number.isFinite(workerConcurrency) && workerConcurrency > 0
        ? Math.min(workerConcurrency, 5)
        : 1
  };
}

export function queueSettingsStatus() {
  const config = queueConfig();
  return {
    queueEnabled: config.enabled,
    redisUrlConfigured: Boolean(config.redisUrl),
    queueName: config.queueName,
    workerConcurrency: config.workerConcurrency
  };
}

export function createBullMqConnectionOptions(): ConnectionOptions | null {
  const config = queueConfig();
  if (!config.redisUrl) return null;

  let parsed: URL;
  try {
    parsed = new URL(config.redisUrl);
  } catch {
    return null;
  }
  const port = parsed.port
    ? Number.parseInt(parsed.port, 10)
    : parsed.protocol === "rediss:"
      ? 6380
      : 6379;
  const db = parsed.pathname && parsed.pathname !== "/"
    ? Number.parseInt(parsed.pathname.replace("/", ""), 10)
    : undefined;

  return {
    host: parsed.hostname,
    port,
    username: parsed.username ? decodeURIComponent(parsed.username) : undefined,
    password: parsed.password ? decodeURIComponent(parsed.password) : undefined,
    db: Number.isFinite(db) ? db : undefined,
    tls: parsed.protocol === "rediss:" ? {} : undefined,
    maxRetriesPerRequest: null,
    retryStrategy: (attempt: number) => Math.min(attempt * 250, 3000)
  } as ConnectionOptions;
}

export async function testRedisConnection() {
  const config = queueConfig();

  if (!config.enabled) {
    return {
      ok: true,
      queueEnabled: false,
      redisConnected: false,
      queueName: config.queueName,
      workerConcurrency: config.workerConcurrency,
      message: "Queue is disabled. Using sync execution."
    };
  }

  if (!config.redisUrl) {
    return {
      ok: true,
      queueEnabled: true,
      redisConnected: false,
      queueName: config.queueName,
      workerConcurrency: config.workerConcurrency,
      message: "REDIS_URL is missing. Falling back to sync execution."
    };
  }

  let redis: IORedis | undefined;

  try {
    redis = new IORedis(config.redisUrl, {
      lazyConnect: true,
      connectTimeout: 3000,
      maxRetriesPerRequest: 0,
      retryStrategy: () => null
    });
    await redis.connect();
    await redis.ping();
    return {
      ok: true,
      queueEnabled: true,
      redisConnected: true,
      queueName: config.queueName,
      workerConcurrency: config.workerConcurrency,
      message: "Redis connected"
    };
  } catch (error) {
    return {
      ok: true,
      queueEnabled: true,
      redisConnected: false,
      queueName: config.queueName,
      workerConcurrency: config.workerConcurrency,
      message: "Redis is unavailable. Falling back to sync execution.",
      error: error instanceof Error ? error.message : "Unknown Redis error"
    };
  } finally {
    redis?.disconnect();
  }
}
