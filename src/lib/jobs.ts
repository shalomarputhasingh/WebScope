import { randomUUID } from "node:crypto";
import { graph } from "./graph";

export type JobEvent =
  | { type: "progress"; message: string }
  | { type: "done"; summary: string; report: string; mail: string; pdfUrl: string; sources: number }
  | { type: "error"; message: string };

type Job = { events: JobEvent[]; listeners: Set<(e: JobEvent) => void>; finished: boolean; pdf?: Buffer; created: number };

// Survive Next dev hot-reloads.
const g = globalThis as unknown as { __jobs?: Map<string, Job> };
const jobs = (g.__jobs ??= new Map<string, Job>());

const TTL = 60 * 60 * 1000;

export const getJob = (id: string) => jobs.get(id);

export function startJob(topic: string, email: string): string {
  for (const [id, j] of jobs) if (Date.now() - j.created > TTL) jobs.delete(id);
  const id = randomUUID();
  const job: Job = { events: [], listeners: new Set(), finished: false, created: Date.now() };
  jobs.set(id, job);
  const push = (e: JobEvent) => {
    job.events.push(e);
    if (e.type !== "progress") job.finished = true;
    job.listeners.forEach((l) => l(e));
  };

  graph
    .invoke({ topic, email }, { configurable: { emit: (message: string) => push({ type: "progress", message }) } })
    .then((out) => {
      job.pdf = out.pdf;
      push({ type: "done", summary: out.summary, report: out.reportMd, mail: out.mailStatus ?? "skipped", pdfUrl: `/api/jobs/${id}/pdf`, sources: out.sources.length });
    })
    .catch((e) => push({ type: "error", message: String(e?.message ?? e).slice(0, 400) }));
  return id;
}
