/** LangGraph pipeline: plan -> research -> write -> summarize -> make_pdf -> email */
import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import type { RunnableConfig } from "@langchain/core/runnables";
import { ChatGroq } from "@langchain/groq";
import { config } from "./config";
import { sendReport } from "./mailer";
import { buildPdf } from "./pdf";
import { gather, type Source } from "./search";

type Section = { title: string; query: string; sourceIds: number[] };

const State = Annotation.Root({
  topic: Annotation<string>(),
  email: Annotation<string>(),
  sections: Annotation<Section[]>(),
  sources: Annotation<Source[]>(),
  body: Annotation<string[]>(),
  reportMd: Annotation<string>(),
  summary: Annotation<string>(),
  pdf: Annotation<Buffer>(),
  mailStatus: Annotation<string>(),
});
type S = typeof State.State;

// ---- Groq free-tier friendly calling -------------------------------------------------
// Free tiers cap tokens-per-minute (e.g. 8,000). We (1) keep prompts small, (2) pace calls with a
// sliding 60s token budget, and (3) wait out any 429 using the "try again in Ns" hint.
const TPM_BUDGET = Number(process.env.GROQ_TPM || 6000);
const used: { t: number; n: number }[] = [];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const estTokens = (s: string) => Math.ceil(s.length / 3.5);

async function waitForBudget(need: number, onWait?: (s: number) => void) {
  for (;;) {
    const now = Date.now();
    while (used.length && now - used[0].t > 60_000) used.shift();
    const total = used.reduce((a, u) => a + u.n, 0);
    if (total + need <= TPM_BUDGET || !used.length) return;
    const wait = Math.ceil((60_000 - (now - used[0].t)) / 1000) + 1;
    onWait?.(wait);
    await sleep(wait * 1000);
  }
}

async function ask(system: string, user: string, temperature = 0.3, maxTokens = 900, onWait?: (s: number) => void): Promise<string> {
  const llm = new ChatGroq({ model: config.groqModel(), apiKey: config.groqKey(), temperature, maxTokens, maxRetries: 0 });
  const need = estTokens(system + user) + maxTokens;
  for (let attempt = 0; ; attempt++) {
    await waitForBudget(need, onWait);
    used.push({ t: Date.now(), n: need });
    try {
      const res = await llm.invoke([
        { role: "system", content: system },
        { role: "user", content: user },
      ]);
      return String(res.content).trim();
    } catch (e: any) {
      const msg = String(e?.message ?? e);
      if ((e?.status === 429 || msg.includes("rate_limit")) && attempt < 8) {
        const hint = Number(msg.match(/try again in ([\d.]+)s/i)?.[1] ?? 15);
        onWait?.(Math.ceil(hint) + 1);
        await sleep((hint + 1) * 1000);
        continue;
      }
      throw e;
    }
  }
}

const emit = (cfg: RunnableConfig, msg: string) => (cfg.configurable?.emit as ((m: string) => void) | undefined)?.(msg);

async function plan(state: S, cfg: RunnableConfig) {
  emit(cfg, "Planning the research outline…");
  const raw = await ask(
    "You are a research planner. Reply with ONLY a JSON array of 5 objects, each " +
      '{"title": "<section title>", "query": "<focused web search query>"}. ' +
      "Sections must cover distinct angles (overview/background, key facts & data, current developments, " +
      "challenges/criticism, outlook). No prose.",
    `Topic: ${state.topic}`,
    0.2,
  );
  let sections: Section[] = [];
  try {
    const arr = JSON.parse(raw.match(/\[[\s\S]*\]/)?.[0] ?? "[]");
    sections = arr.slice(0, 6).map((s: any) => ({ title: String(s.title), query: String(s.query), sourceIds: [] }));
  } catch {}
  if (!sections.length) {
    const t = state.topic;
    sections = [
      ["Overview", `${t} overview`],
      ["Key Facts and Data", `${t} statistics facts`],
      ["Recent Developments", `${t} latest news`],
      ["Challenges and Criticism", `${t} challenges criticism`],
      ["Outlook", `${t} future outlook`],
    ].map(([title, query]) => ({ title, query, sourceIds: [] }));
  }
  return { sections };
}

async function research(state: S, cfg: RunnableConfig) {
  emit(cfg, `Searching the web across ${state.sections.length} angles…`);
  const results = await Promise.all(state.sections.map((s) => gather(s.query)));
  const sources: Source[] = [];
  const byUrl = new Map<string, number>();
  const sections = state.sections.map((sec, i) => {
    const sourceIds: number[] = [];
    for (const h of results[i]) {
      if (!byUrl.has(h.url)) {
        byUrl.set(h.url, sources.length + 1);
        sources.push({ id: sources.length + 1, title: h.title || h.url, url: h.url, text: h.text });
      }
      sourceIds.push(byUrl.get(h.url)!);
    }
    return { ...sec, sourceIds };
  });
  if (!sources.length) throw new Error("Web search returned no results. Check the server's internet access and try again.");
  emit(cfg, `Collected ${sources.length} sources.`);
  return { sections, sources };
}

async function write(state: S, cfg: RunnableConfig) {
  const byId = new Map(state.sources.map((s) => [s.id, s]));
  const body: string[] = [];
  for (const [i, sec] of state.sections.entries()) {
    emit(cfg, `Writing section ${i + 1}/${state.sections.length}: ${sec.title}`);
    const ctx = [...new Set(sec.sourceIds)]
      .map((id) => `[${id}] ${byId.get(id)!.title}\n${byId.get(id)!.text.slice(0, 1200)}`)
      .join("\n\n");
    body.push(
      ctx
        ? await ask(
            "You are an expert research analyst writing one section of a report. Use ONLY the numbered " +
              "sources provided. Cite claims inline as [1], [2]. Write 2-4 concise, information-dense " +
              "paragraphs (use a short bullet list if it helps). Do not invent facts; do not include a " +
              "heading or a references list.",
            `Report topic: ${state.topic}\nSection: ${sec.title}\n\nSOURCES:\n${ctx}`,
            0.3, 1100, (s) => emit(cfg, `Waiting ~${s}s for the Groq rate limit…`),
          )
        : "_No reliable sources were found for this section._",
    );
  }
  return { body };
}

async function summarize(state: S, cfg: RunnableConfig) {
  emit(cfg, "Writing executive summary…");
  const joined = state.sections.map((s, i) => `${s.title}:\n${state.body[i]}`).join("\n\n");
  const summary = await ask(
    "Write an executive summary of this research in 4-5 sentences of plain prose, with no citations or markdown. Be specific and concrete.",
    `Topic: ${state.topic}\n\n${joined}`.slice(0, 7000),
    0.3, 500, (s) => emit(cfg, `Waiting ~${s}s for the Groq rate limit…`),
  );
  const title = state.topic.trim().replace(/\b\w/g, (c) => c.toUpperCase());
  const md = [`# ${title}`, "## Executive Summary", summary];
  state.sections.forEach((s, i) => md.push(`## ${s.title}`, state.body[i]));
  md.push("## Sources", ...state.sources.map((s) => `[${s.id}] ${s.title} - ${s.url}`));
  return { summary, reportMd: md.join("\n\n") };
}

async function makePdf(state: S, cfg: RunnableConfig) {
  emit(cfg, "Generating PDF…");
  return { pdf: await buildPdf(state.topic, state.reportMd) };
}

async function email(state: S, cfg: RunnableConfig) {
  if (!state.email) return { mailStatus: "skipped" };
  if (!config.mailConfigured()) {
    emit(cfg, "Email not configured on the server — skipping send.");
    return { mailStatus: "not_configured" };
  }
  emit(cfg, `Sending email to ${state.email}…`);
  try {
    await sendReport(state.email, state.topic, state.summary, state.pdf);
    return { mailStatus: "sent" };
  } catch (e: any) {
    return { mailStatus: `failed: ${e?.message ?? e}` };
  }
}

export const graph = new StateGraph(State)
  .addNode("plan", plan)
  .addNode("research", research)
  .addNode("write", write)
  .addNode("summarize", summarize)
  .addNode("make_pdf", makePdf)
  .addNode("send_email", email)
  .addEdge(START, "plan")
  .addEdge("plan", "research")
  .addEdge("research", "write")
  .addEdge("write", "summarize")
  .addEdge("summarize", "make_pdf")
  .addEdge("make_pdf", "send_email")
  .addEdge("send_email", END)
  .compile();
