import IORedis from "ioredis";
import { NextResponse } from "next/server";
import { appLogger } from "@/lib/logger";
import { getRequestContext } from "@/lib/requestContext";

type RateLimitPolicyName =
  | "runs_start"
  | "import_enrichment"
  | "buyer_fit_scoring"
  | "email_draft_generation"
  | "email_send"
  | "companies_export"
  | "review_action"
  | "crm_write"
  | "auth_login"
  | "settings_test"
  | "search_provider"
  | "minimax";

interface RateLimitPolicy {
  limit: number;
  windowMs: number;
}

interface RateLimitInput {
  policy: RateLimitPolicyName;
  subject: string;
}

const memoryBuckets = new Map<string, { count: number; resetAt: number }>();

const policies: Record<RateLimitPolicyName, RateLimitPolicy> = {
  runs_start: { limit: envInt("RATE_LIMIT_RUNS_START_PER_MINUTE", 5), windowMs: 60_000 },
  import_enrichment: { limit: envInt("RATE_LIMIT_IMPORT_ENRICH_PER_MINUTE", 12), windowMs: 60_000 },
  buyer_fit_scoring: { limit: envInt("RATE_LIMIT_BUYER_FIT_PER_MINUTE", 12), windowMs: 60_000 },
  email_draft_generation: { limit: envInt("RATE_LIMIT_EMAIL_DRAFT_PER_MINUTE", 10), windowMs: 60_000 },
  email_send: { limit: envInt("RATE_LIMIT_EMAIL_SEND_PER_5_MINUTES", 3), windowMs: 300_000 },
  companies_export: { limit: envInt("RATE_LIMIT_COMPANIES_EXPORT_PER_5_MINUTES", 10), windowMs: 300_000 },
  review_action: { limit: envInt("RATE_LIMIT_REVIEW_ACTION_PER_MINUTE", 30), windowMs: 60_000 },
  crm_write: { limit: envInt("RATE_LIMIT_CRM_WRITE_PER_MINUTE", 30), windowMs: 60_000 },
  auth_login: { limit: envInt("RATE_LIMIT_AUTH_LOGIN_PER_MINUTE", 10), windowMs: 60_000 },
  settings_test: { limit: envInt("RATE_LIMIT_SETTINGS_TEST_PER_MINUTE", 20), windowMs: 60_000 },
  search_provider: { limit: envInt("RATE_LIMIT_SEARCH_PROVIDER_PER_MINUTE", 30), windowMs: 60_000 },
  minimax: { limit: envInt("RATE_LIMIT_MINIMAX_PER_MINUTE", 20), windowMs: 60_000 }
};

export function rateLimitStatus() {
  return {
    enabled: rateLimitEnabled(),
    backend: shouldUseRedisRateLimit() ? "redis" : "memory",
    policies: Object.fromEntries(
      Object.entries(policies).map(([name, policy]) => [
        name,
        {
          limit: policy.limit,
          windowMs: policy.windowMs
        }
      ])
    )
  };
}

export async function requireRateLimit(request: Request, policy: RateLimitPolicyName) {
  if (!rateLimitEnabled()) return null;

  const context = getRequestContext(request);
  const subject = context.ipAddress ?? "unknown";
  const result = await consumeRateLimit({
    policy,
    subject
  });

  if (result.allowed) return null;

  appLogger.warn("rate_limit.blocked", {
    policy,
    subject,
    requestId: context.requestId,
    retryAfterSeconds: result.retryAfterSeconds
  });

  return NextResponse.json(
    {
      ok: false,
      error: "Too many requests. Please retry later.",
      policy,
      retryAfterSeconds: result.retryAfterSeconds
    },
    {
      status: 429,
      headers: {
        "Retry-After": String(result.retryAfterSeconds),
        "X-RateLimit-Limit": String(result.limit),
        "X-RateLimit-Remaining": "0",
        "X-RateLimit-Reset": String(result.resetAt)
      }
    }
  );
}

export async function consumeRateLimit(input: RateLimitInput) {
  if (!rateLimitEnabled()) return allowResult(input.policy);
  const policy = policies[input.policy];
  const key = `rate:${input.policy}:${safeKey(input.subject)}`;

  if (shouldUseRedisRateLimit()) {
    const redisResult = await consumeRedisRateLimit(key, policy).catch((error) => {
      appLogger.warn("rate_limit.redis_fallback", {
        policy: input.policy,
        error: error instanceof Error ? error.message : "Unknown Redis rate limit error"
      });
      return null;
    });
    if (redisResult) return redisResult;
  }

  return consumeMemoryRateLimit(key, policy);
}

function allowResult(policyName: RateLimitPolicyName) {
  const policy = policies[policyName];
  return {
    allowed: true,
    limit: policy.limit,
    remaining: policy.limit,
    resetAt: Date.now() + policy.windowMs,
    retryAfterSeconds: 0
  };
}

async function consumeRedisRateLimit(key: string, policy: RateLimitPolicy) {
  const redisUrl = process.env.REDIS_URL?.trim();
  if (!redisUrl) return null;

  const redis = new IORedis(redisUrl, {
    lazyConnect: true,
    connectTimeout: 2000,
    maxRetriesPerRequest: 0,
    retryStrategy: () => null
  });

  try {
    await redis.connect();
    const count = await redis.incr(key);
    if (count === 1) await redis.pexpire(key, policy.windowMs);
    const ttl = await redis.pttl(key);
    const resetAt = Date.now() + Math.max(ttl, 0);
    const remaining = Math.max(0, policy.limit - count);

    return {
      allowed: count <= policy.limit,
      limit: policy.limit,
      remaining,
      resetAt,
      retryAfterSeconds: count <= policy.limit ? 0 : Math.max(1, Math.ceil(ttl / 1000))
    };
  } finally {
    redis.disconnect();
  }
}

function consumeMemoryRateLimit(key: string, policy: RateLimitPolicy) {
  const now = Date.now();
  const existing = memoryBuckets.get(key);
  const bucket = existing && existing.resetAt > now
    ? existing
    : {
        count: 0,
        resetAt: now + policy.windowMs
      };
  bucket.count += 1;
  memoryBuckets.set(key, bucket);

  return {
    allowed: bucket.count <= policy.limit,
    limit: policy.limit,
    remaining: Math.max(0, policy.limit - bucket.count),
    resetAt: bucket.resetAt,
    retryAfterSeconds:
      bucket.count <= policy.limit ? 0 : Math.max(1, Math.ceil((bucket.resetAt - now) / 1000))
  };
}

function rateLimitEnabled() {
  return process.env.SECURITY_RATE_LIMIT_ENABLED !== "false";
}

function shouldUseRedisRateLimit() {
  return (
    process.env.QUEUE_ENABLED === "true" &&
    Boolean(process.env.REDIS_URL?.trim()) &&
    process.env.SECURITY_RATE_LIMIT_BACKEND !== "memory"
  );
}

function envInt(name: string, fallback: number) {
  const value = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function safeKey(value: string) {
  return value.replace(/[^a-zA-Z0-9_.:-]/g, "_").slice(0, 120);
}
