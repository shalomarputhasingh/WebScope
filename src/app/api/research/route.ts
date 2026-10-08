import { z } from "zod";
import { config } from "@/lib/config";
import { startJob } from "@/lib/jobs";

export const runtime = "nodejs";
export const maxDuration = 300;

const Body = z.object({
  topic: z.string().trim().min(3).max(300),
  email: z.string().trim().email().nullish().or(z.literal("")),
});

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ detail: "Please enter a topic (3+ characters) and a valid email address." }, { status: 422 });
  if (!config.groqKey()) return Response.json({ detail: "GROQ_API_KEY is not set on the server. Add it to .env.local and restart." }, { status: 503 });
  return Response.json({ job_id: startJob(parsed.data.topic, parsed.data.email || "") });
}
