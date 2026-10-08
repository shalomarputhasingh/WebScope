/**
 * Free research sources that return clean text (no HTML scraping):
 *  1. Tavily  — web search built for LLMs. Free tier: 1,000 searches/month, no card. Needs TAVILY_API_KEY.
 *  2. Wikipedia — keyless fallback, plain-text JSON API.
 */
import { config } from "./config";

export type Source = { id: number; title: string; url: string; text: string };
type Hit = { title: string; url: string; text: string };

const TEXT_CHARS = 2500;

async function tavily(query: string, n: number): Promise<Hit[]> {
  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.tavilyKey()}` },
    body: JSON.stringify({ query, max_results: n, search_depth: "basic", include_answer: false }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Tavily error ${res.status}: ${(await res.text()).slice(0, 120)}`);
  const data = (await res.json()) as { results?: { title: string; url: string; content: string }[] };
  return (data.results ?? []).map((r) => ({ title: r.title, url: r.url, text: r.content.slice(0, TEXT_CHARS) }));
}

async function wikipedia(query: string, n: number): Promise<Hit[]> {
  const params = new URLSearchParams({
    action: "query", format: "json", generator: "search", gsrsearch: query, gsrlimit: String(n),
    prop: "extracts", explaintext: "1", exlimit: "max", exchars: String(TEXT_CHARS),
  });
  const res = await fetch(`https://en.wikipedia.org/w/api.php?${params}`, {
    headers: { "User-Agent": "WebScope/1.0 (research tool)" },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Wikipedia error ${res.status}`);
  const data = (await res.json()) as { query?: { pages?: Record<string, { pageid: number; title: string; index: number; extract?: string }> } };
  return Object.values(data.query?.pages ?? {})
    .sort((a, b) => a.index - b.index)
    .filter((p) => p.extract)
    .map((p) => ({ title: p.title, url: `https://en.wikipedia.org/?curid=${p.pageid}`, text: p.extract!.replace(/\n{2,}/g, "\n").trim() }));
}

export const searchProvider = () => (config.tavilyKey() ? "Tavily" : "Wikipedia");

export async function gather(query: string, n = 4): Promise<Hit[]> {
  try {
    return config.tavilyKey() ? await tavily(query, n) : await wikipedia(query, n);
  } catch (e) {
    console.error("[search]", (e as Error).message);
    return [];
  }
}
