"""LangGraph pipeline: plan -> research -> write -> summarize -> pdf -> email."""
import json
import re
from concurrent.futures import ThreadPoolExecutor
from typing import Callable, TypedDict

from langchain_core.messages import HumanMessage, SystemMessage
from langchain_core.runnables import RunnableConfig
from langchain_groq import ChatGroq
from langgraph.graph import END, START, StateGraph

from . import config as settings
from .mailer import send_report
from .pdf import build_pdf
from .search import gather


class State(TypedDict, total=False):
    topic: str
    email: str
    sections: list[dict]  # {title, query, source_ids}
    sources: list[dict]  # {id, title, url, text}
    body: list[str]  # markdown per section
    report_md: str
    summary: str
    pdf_path: str
    mail_status: str


def _llm(temperature: float = 0.3) -> ChatGroq:
    return ChatGroq(model=settings.GROQ_MODEL, api_key=settings.GROQ_API_KEY, temperature=temperature, max_retries=4)


def _ask(system: str, user: str, temperature: float = 0.3) -> str:
    return _llm(temperature).invoke([SystemMessage(content=system), HumanMessage(content=user)]).content.strip()


def _emit(cfg, msg: str):
    fn: Callable | None = (cfg or {}).get("configurable", {}).get("emit")
    if fn:
        fn(msg)


# ---------------------------------------------------------------- nodes
def plan(state: State, config: RunnableConfig) -> dict:
    _emit(config, "Planning the research outline…")
    raw = _ask(
        "You are a research planner. Reply with ONLY a JSON array of 5 objects, each "
        '{"title": "<section title>", "query": "<focused web search query>"}. '
        "Sections must cover distinct angles (overview/background, key facts & data, "
        "current developments, challenges/criticism, outlook). No prose.",
        f"Topic: {state['topic']}",
        temperature=0.2,
    )
    match = re.search(r"\[.*\]", raw, re.S)
    try:
        sections = json.loads(match.group(0)) if match else []
        sections = [{"title": str(s["title"]), "query": str(s["query"])} for s in sections][:6]
    except Exception:
        sections = []
    if not sections:
        t = state["topic"]
        sections = [
            {"title": "Overview", "query": f"{t} overview"},
            {"title": "Key Facts and Data", "query": f"{t} statistics facts"},
            {"title": "Recent Developments", "query": f"{t} latest news"},
            {"title": "Challenges and Criticism", "query": f"{t} challenges criticism"},
            {"title": "Outlook", "query": f"{t} future outlook"},
        ]
    return {"sections": sections}


def research(state: State, config: RunnableConfig) -> dict:
    sections = state["sections"]
    _emit(config, f"Searching the web across {len(sections)} angles…")
    with ThreadPoolExecutor(max_workers=len(sections)) as ex:
        results = list(ex.map(lambda s: gather(s["query"]), sections))
    sources: list[dict] = []
    by_url: dict[str, int] = {}
    for sec, hits in zip(sections, results):
        sec["source_ids"] = []
        for h in hits:
            if h["url"] not in by_url:
                by_url[h["url"]] = len(sources) + 1
                sources.append({"id": by_url[h["url"]], "title": h["title"] or h["url"], "url": h["url"], "text": h["text"]})
            sec["source_ids"].append(by_url[h["url"]])
    _emit(config, f"Collected {len(sources)} sources.")
    return {"sections": sections, "sources": sources}


def write(state: State, config: RunnableConfig) -> dict:
    sources = {s["id"]: s for s in state["sources"]}
    body = []
    for i, sec in enumerate(state["sections"], 1):
        _emit(config, f"Writing section {i}/{len(state['sections'])}: {sec['title']}")
        ctx = "\n\n".join(
            f"[{sid}] {sources[sid]['title']}\n{sources[sid]['text'][:1800]}" for sid in dict.fromkeys(sec["source_ids"])
        )
        if not ctx:
            body.append("_No reliable sources were found for this section._")
            continue
        body.append(
            _ask(
                "You are an expert research analyst writing one section of a report. Use ONLY the "
                "numbered sources provided. Cite claims inline as [1], [2]. Write 2-4 concise, "
                "information-dense paragraphs (use a short bullet list if it helps). Do not invent "
                "facts; do not include a heading or a references list.",
                f"Report topic: {state['topic']}\nSection: {sec['title']}\n\nSOURCES:\n{ctx}",
            )
        )
    return {"body": body}


def summarize(state: State, config: RunnableConfig) -> dict:
    _emit(config, "Writing executive summary…")
    joined = "\n\n".join(f"{s['title']}:\n{b}" for s, b in zip(state["sections"], state["body"]))
    summary = _ask(
        "Write an executive summary of this research in 4-5 sentences of plain prose, with no "
        "citations or markdown. Be specific and concrete.",
        f"Topic: {state['topic']}\n\n{joined}"[:12000],
    )
    md = [f"# {state['topic'].strip().title()}", "## Executive Summary", summary]
    for s, b in zip(state["sections"], state["body"]):
        md += [f"## {s['title']}", b]
    md.append("## Sources")
    md += [f"[{s['id']}] {s['title']} - {s['url']}" for s in state["sources"]]
    return {"summary": summary, "report_md": "\n\n".join(md)}


def make_pdf(state: State, config: RunnableConfig) -> dict:
    _emit(config, "Generating PDF…")
    return {"pdf_path": str(build_pdf(state["topic"], state["report_md"], state["summary"]))}


def email(state: State, config: RunnableConfig) -> dict:
    if not state.get("email"):
        return {"mail_status": "skipped"}
    if not settings.mail_configured():
        _emit(config, "Email not configured on the server — skipping send.")
        return {"mail_status": "not_configured"}
    _emit(config, f"Sending email to {state['email']}…")
    try:
        send_report(state["email"], state["topic"], state["summary"], state["pdf_path"])
        return {"mail_status": "sent"}
    except Exception as e:  # surface the reason, but keep the report
        return {"mail_status": f"failed: {e}"}


def build_graph():
    g = StateGraph(State)
    for name, fn in [("plan", plan), ("research", research), ("write", write),
                     ("summarize", summarize), ("make_pdf", make_pdf), ("email", email)]:
        g.add_node(name, fn)
    g.add_edge(START, "plan")
    for a, b in [("plan", "research"), ("research", "write"), ("write", "summarize"),
                 ("summarize", "make_pdf"), ("make_pdf", "email")]:
        g.add_edge(a, b)
    g.add_edge("email", END)
    return g.compile()
