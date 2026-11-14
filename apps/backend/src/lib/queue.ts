import { Queue, Worker, type JobsOptions } from "bullmq";
import IORedis from "ioredis";
import { logger } from "./logger";

export const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";

let connection: IORedis | null = null;

export function getQueueConnection(): IORedis {
  if (!connection) {
    connection = new IORedis(REDIS_URL, { maxRetriesPerRequest: null } as never);
    connection.on("error", (err: Error) => logger.warn({ err: err.message }, "bullmq redis error"));
  }
  return connection;
}

export const QUEUES = {
  booking: "staynova-bookings",
  jobs: "staynova-jobs",
} as const;

const queues = new Map<string, Queue>();

export function getQueue(name: string): Queue {
  let q = queues.get(name);
  if (!q) {
    q = new Queue(name, { connection: getQueueConnection() as never });
    queues.set(name, q);
  }
  return q;
}

export async function enqueueJob(
  queue: string,
  jobId: string,
  jobName: string,
  data: Record<string, unknown>,
  delayMs = 0
) {
  try {
    const q = getQueue(queue);
    const opts: JobsOptions = {
      delay: delayMs,
      removeOnComplete: 200,
      removeOnFail: 500,
      attempts: 3,
      backoff: { type: "exponential", delay: 3000 } as never,
    };
    if (jobId) opts.jobId = jobId;
    await q.add(jobName, data, opts);
  } catch (e) {
    logger.warn({ err: e, jobName }, "enqueue failed (redis down?)");
  }
}

export function startWorkers(
  queueName: string,
  handlers: Record<string, (data: any) => Promise<void>>,
  concurrency = 5
) {
  const worker = new Worker(
    queueName,
    async (job) => {
      const handler = handlers[job.name];
      if (!handler) {
        logger.warn({ job: job.name }, "no handler registered");
        return;
      }
      await handler(job.data);
    },
    { connection: getQueueConnection() as never, concurrency }
  );
  worker.on("failed", (job, err) => {
    logger.error({ job: job?.name, jobId: job?.id, err: err.message }, "job failed");
  });
  return worker;
}

export async function scheduleCron(queue: string, jobName: string, data: Record<string, unknown>, everyMs: number) {
  await getQueue(queue).add(jobName, data, { repeat: { every: everyMs }, removeOnComplete: 50 } as never);
}
