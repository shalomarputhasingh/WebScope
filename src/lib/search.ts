import * as cheerio from "cheerio";

export type Source = { id: number; title: string; url: string; text: string };
type Hit = { title: string; url: string; snippet: string; text: string };

const UA = "Mozilla/5.0 (compatible; WebScopeBot/1.0)";
const PAGE_CHARS = 2500;

async function webSearch(query: string, n: number): Promise<Omit<Hit, "text">[]> {
  try {
    const res = await fetch("https://html.duckduckgo.com/html/", {
      method: "POST",
      headers: { "User-Agent": UA, "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ q: query }),
      signal: AbortSignal.timeout(10_000),
    });
    const $ = cheerio.load(await res.text());
    const hits: Omit<Hit, "text">[] = [];
    $(".result").each((_, el) => {
      if (hits.length >= n) return;
      const a = $(el).find("a.result__a").first();
      let href = a.attr("href") ?? "";
      // DDG wraps targets as //duckduckgo.com/l/?uddg=<encoded url>
      const m = href.match(/[?&]uddg=([^&]+)/);
      if (m) href = decodeURIComponent(m[1]);
      if (!/^https?:\/\//.test(href) || $(el).hasClass("result--ad")) return;
      hits.push({ title: a.text().trim(), url: href, snippet: $(el).find(".result__snippet").text().trim() });
    });
    return hits;
  } catch {
    return [];
  }
}

async function fetchText(url: string): Promise<string> {
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(8_000) });
    if (!(res.headers.get("content-type") ?? "").includes("text/html")) return "";
    const $ = cheerio.load(await res.text());
    $("script,style,nav,footer,header,aside,form").remove();
    const paras = $("p,li").map((_, e) => $(e).text().replace(/\s+/g, " ").trim()).get().filter((p) => p.length > 40);
    return paras.join(" ").slice(0, PAGE_CHARS);
  } catch {
    return "";
  }
}

/** Search and enrich the top results with page text. */
export async function gather(query: string, n = 4): Promise<Hit[]> {
  const hits = await webSearch(query, n);
  const texts = await Promise.all(hits.map((h) => fetchText(h.url)));
  return hits.map((h, i) => ({ ...h, text: texts[i] || h.snippet }));
}
