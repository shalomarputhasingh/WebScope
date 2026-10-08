import { config } from "@/lib/config";

export const dynamic = "force-dynamic";

export const GET = () => Response.json({ groq: !!config.groqKey(), mail: config.mailConfigured() });
