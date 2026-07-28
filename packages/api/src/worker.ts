// ChainJob worker — the async half of the trading API.
//
// Every endpoint answers from the DB immediately; on-chain work (settling
// matched orders, reporting payouts, redeeming, batch market creation) is
// queued as a ChainJob row and executed here. Execution is STRICTLY SERIAL
// on purpose: all txs are sent by the operator or a server-held demo key,
// so a single lane doubles as nonce management — no races, no gap stalls.
// Throughput is bounded by the chain anyway.
//
// Jobs are claimed atomically (updateMany PENDING→RUNNING guarded on the
// count), so even a second accidental process can't double-execute — the
// flaw we found in the reference project's queue.

import type { ChainJob, ChainJobType } from "@prisma/client";
import { prisma } from "./db";

export interface JobHandler {
  run: (job: ChainJob) => Promise<unknown>; // resolved value stored in result.ok
  /// Called once when the job fails terminally (attempts exhausted) —
  /// compensate here (reverse DB fills, flip statuses). Must not throw.
  onFailed?: (job: ChainJob, error: string) => Promise<void>;
}

const handlers = new Map<ChainJobType, JobHandler>();

export function registerHandler(type: ChainJobType, handler: JobHandler) {
  handlers.set(type, handler);
}

/// Enqueue + wake the worker. Returns the job id (hand it to the client for
/// GET /jobs/:id polling).
export async function enqueueJob(type: ChainJobType, payload: unknown, maxAttempts = 3): Promise<string> {
  const job = await prisma.chainJob.create({
    data: { type, payload: payload as object, maxAttempts },
  });
  wake();
  return job.id;
}

const TICK_MS = 1_000;
const STUCK_RUNNING_MS = 2 * 60_000; // crash recovery: RUNNING older than this re-queues
const BACKOFF_BASE_S = 5; // 5s → 25s → 125s

let timer: NodeJS.Timeout | null = null;
let draining = false;

export function startWorker() {
  if (timer) return;
  timer = setInterval(() => void drain(), TICK_MS);
  timer.unref?.(); // don't hold the process open on shutdown
  void drain();
}

export function stopWorker() {
  if (timer) clearInterval(timer);
  timer = null;
}

/// Immediate processing (called after enqueue) — the interval is a fallback.
export function wake() {
  void drain();
}

async function drain() {
  if (draining) return; // single lane
  draining = true;
  try {
    await recoverStuck();
    // Keep pulling until the due queue is empty.
    for (;;) {
      const job = await claimNext();
      if (!job) break;
      await runJob(job);
    }
  } catch (e) {
    console.error("worker drain error:", e);
  } finally {
    draining = false;
  }
}

async function recoverStuck() {
  await prisma.chainJob.updateMany({
    where: { status: "RUNNING", claimedAt: { lt: new Date(Date.now() - STUCK_RUNNING_MS) } },
    data: { status: "PENDING", claimedAt: null },
  });
}

async function claimNext(): Promise<ChainJob | null> {
  const candidate = await prisma.chainJob.findFirst({
    where: { status: "PENDING", runAfter: { lte: new Date() } },
    orderBy: { createdAt: "asc" },
  });
  if (!candidate) return null;
  // Atomic claim: only one caller can flip PENDING→RUNNING.
  const claimed = await prisma.chainJob.updateMany({
    where: { id: candidate.id, status: "PENDING" },
    data: { status: "RUNNING", claimedAt: new Date() },
  });
  if (claimed.count !== 1) return claimNext(); // lost the race — try the next one
  return prisma.chainJob.findUnique({ where: { id: candidate.id } });
}

async function runJob(job: ChainJob) {
  const handler = handlers.get(job.type);
  if (!handler) {
    await prisma.chainJob.update({
      where: { id: job.id },
      data: { status: "FAILED", result: { error: `no handler for ${job.type}` } },
    });
    return;
  }
  try {
    const value = await handler.run(job);
    await prisma.chainJob.update({
      where: { id: job.id },
      data: { status: "CONFIRMED", result: (value ?? { ok: true }) as object },
    });
  } catch (e: any) {
    const error = e?.shortMessage ?? e?.message ?? String(e);
    const attempts = job.attempts + 1;
    if (attempts < job.maxAttempts) {
      const delayS = BACKOFF_BASE_S ** attempts; // 5, 25, 125
      await prisma.chainJob.update({
        where: { id: job.id },
        data: {
          status: "PENDING",
          attempts,
          runAfter: new Date(Date.now() + delayS * 1_000),
          result: { lastError: error },
        },
      });
      console.warn(`job ${job.id} (${job.type}) attempt ${attempts} failed, retrying in ${delayS}s: ${error}`);
    } else {
      await prisma.chainJob.update({
        where: { id: job.id },
        data: { status: "FAILED", attempts, result: { error } },
      });
      console.error(`job ${job.id} (${job.type}) failed terminally: ${error}`);
      try {
        await handler.onFailed?.(job, error);
      } catch (compErr) {
        console.error(`job ${job.id} compensation failed:`, compErr);
      }
    }
  }
}
