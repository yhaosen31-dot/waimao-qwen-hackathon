import { Queue } from "bullmq";
import { updateRun } from "@/repositories/store";
import { createBullMqConnectionOptions, queueConfig, testRedisConnection } from "@/queue/redis";
import type { AddLeadJobInput, AddLeadJobResult } from "@/queue/types";

export async function addLeadJob(input: AddLeadJobInput): Promise<AddLeadJobResult> {
  const config = queueConfig();

  if (!config.enabled) {
    return { queued: false, mode: "sync", reason: "QUEUE_ENABLED=false" };
  }

  const redisStatus = await testRedisConnection();
  if (!redisStatus.redisConnected) {
    await updateRun(input.runId, {
      metadata: {
        queueEnabled: true,
        queueMode: "sync",
        queueStatus: "sync_fallback",
        queueFallbackReason: redisStatus.message,
        queueError: redisStatus.error
      }
    });
    return { queued: false, mode: "sync", reason: redisStatus.message };
  }

  const connection = createBullMqConnectionOptions();
  if (!connection) {
    return { queued: false, mode: "sync", reason: "REDIS_URL is missing" };
  }

  const queue = new Queue(config.queueName, {
    connection,
    defaultJobOptions: {
      attempts: 2,
      backoff: {
        type: "exponential",
        delay: 5000
      },
      removeOnComplete: {
        age: 60 * 60 * 24,
        count: 100
      },
      removeOnFail: {
        age: 60 * 60 * 24 * 7,
        count: 100
      }
    }
  });

  try {
    const job = await queue.add(input.type, input, {
      jobId: `${input.type}:${input.runId}:${Date.now()}`
    });
    const jobId = String(job.id);

    await updateRun(input.runId, {
      metadata: {
        queueEnabled: true,
        queueMode: "queue",
        queueStatus: "queued",
        queueJobId: jobId,
        queueJobType: input.type,
        queuedAt: new Date().toISOString()
      }
    });

    return {
      queued: true,
      jobId,
      mode: "queue"
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown BullMQ error";
    await updateRun(input.runId, {
      metadata: {
        queueEnabled: true,
        queueMode: "sync",
        queueStatus: "sync_fallback",
        queueFallbackReason: message
      }
    });

    return {
      queued: false,
      mode: "sync",
      reason: message
    };
  } finally {
    await queue.close();
  }
}
