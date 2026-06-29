import { pathToFileURL } from "node:url";
import { Worker } from "bullmq";
import { handleLeadJob } from "@/queue/jobHandlers";
import { createBullMqConnectionOptions, queueConfig } from "@/queue/redis";
import type { LeadJobPayload } from "@/queue/types";

export function startLeadWorker() {
  const config = queueConfig();

  if (!config.enabled) {
    console.log("Queue is disabled. Set QUEUE_ENABLED=true to start the BullMQ worker.");
    return null;
  }

  const connection = createBullMqConnectionOptions();
  if (!connection) {
    console.log("REDIS_URL is missing. Worker was not started.");
    return null;
  }

  const worker = new Worker<LeadJobPayload>(
    config.queueName,
    async (job) => {
      console.log(`Processing ${job.name} job ${job.id}`);
      await handleLeadJob(job.data, {
        jobId: String(job.id)
      });
      return {
        ok: true,
        runId: job.data.runId
      };
    },
    {
      connection,
      concurrency: config.workerConcurrency
    }
  );

  worker.on("completed", (job) => {
    console.log(`Completed ${job.name} job ${job.id}`);
  });
  worker.on("failed", (job, error) => {
    console.error(`Failed ${job?.name ?? "unknown"} job ${job?.id ?? "unknown"}:`, error);
  });
  worker.on("error", (error) => {
    console.error("Lead worker error:", error);
  });

  console.log(
    `Lead worker started. queue=${config.queueName} concurrency=${config.workerConcurrency}`
  );
  return worker;
}

const isDirectRun = process.argv[1]
  ? import.meta.url === pathToFileURL(process.argv[1]).href
  : false;

if (isDirectRun) {
  startLeadWorker();
}
