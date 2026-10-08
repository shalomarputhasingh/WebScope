"""Web search + page reading (no API key needed)."""
from concurrent.futures import ThreadPoolExecutor

import httpx
from bs4 import BeautifulSoup
from ddgs import DDGS

HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; WebScopeBot/1.0)"}
PAGE_CHARS = 2500


def web_search(query: str, n: int = 5) -> list[dict]:
    try:
        hits = DDGS().text(query, max_results=n) or []
    except Exception:
        return []
    return [
        {"title": h.get("title", ""), "url": h.get("href", ""), "snippet": h.get("body", "")}
        for h in hits
        if h.get("href")
    ]


def fetch_text(url: str) -> str:
    try:
        r = httpx.get(url, headers=HEADERS, timeout=8, follow_redirects=True)
        if "text/html" not in r.headers.get("content-type", ""):
            return ""
        soup = BeautifulSoup(r.text, "html.parser")
        for tag in soup(["script", "style", "nav", "footer", "header", "aside", "form"]):
            tag.decompose()
        paras = [p.get_text(" ", strip=True) for p in soup.find_all(["p", "li"])]
        text = " ".join(p for p in paras if len(p) > 40)
        return text[:PAGE_CHARS]
    except Exception:
        return ""


def gather(query: str, n: int = 4) -> list[dict]:
    """Search and enrich the top results with page text."""
    hits = web_search(query, n)
    with ThreadPoolExecutor(max_workers=n) as ex:
        texts = list(ex.map(lambda h: fetch_text(h["url"]), hits))
    for h, t in zip(hits, texts):
        h["text"] = t or h["snippet"]
    return hits
