import { getJob, type JobEvent } from "@/lib/jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const job = getJob((await params).id);
  if (!job) return new Response("Not found", { status: 404 });
  const enc = new TextEncoder();
  let listener: ((e: JobEvent) => void) | undefined;

  const stream = new ReadableStream({
    start(controller) {
      const send = (e: JobEvent) => {
        controller.enqueue(enc.encode(`data: ${JSON.stringify(e)}\n\n`));
        if (e.type !== "progress") {
          job.listeners.delete(send);
          controller.close();
        }
      };
      listener = send;
      for (const e of [...job.events]) {
        send(e);
        if (e.type !== "progress") return;
      }
      job.listeners.add(send);
    },
    cancel() {
      if (listener) job.listeners.delete(listener);
    },
  });
  return new Response(stream, { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive" } });
}
