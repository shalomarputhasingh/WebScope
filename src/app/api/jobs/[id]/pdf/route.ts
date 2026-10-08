import { getJob } from "@/lib/jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const pdf = getJob((await params).id)?.pdf;
  if (!pdf) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(pdf), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": 'attachment; filename="webscope-report.pdf"' },
  });
}
