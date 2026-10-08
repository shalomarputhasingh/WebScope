"use client";

import { useEffect, useRef, useState } from "react";
import Markdown from "./Markdown";

type Done = { summary: string; report: string; mail: string; pdfUrl: string };

const EXAMPLES = ["Quantum computing in 2026", "Impact of remote work on productivity", "Solid-state batteries", "Rise of AI agents"];

export default function Home() {
  const [topic, setTopic] = useState("");
  const [email, setEmail] = useState("");
  const [cfg, setCfg] = useState<{ groq: boolean; mail: boolean } | null>(null);
  const [phase, setPhase] = useState<"form" | "running" | "done">("form");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [log, setLog] = useState<string[]>([]);
  const [result, setResult] = useState<(Done & { topic: string; email: string }) | null>(null);
  const form = useRef<HTMLFormElement>(null);

  useEffect(() => {
    fetch("/api/config").then((r) => r.json()).then(setCfg).catch(() => {});
  }, []);

  const err = error || (cfg && !cfg.groq ? "Server is missing GROQ_API_KEY — add it to .env.local and restart." : "");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const t = topic.trim(), em = email.trim();
      const r = await fetch("/api/research", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ topic: t, email: em || null }) });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).detail ?? "Something went wrong.");
      const { job_id } = await r.json();
      setLog([]);
      setPhase("running");
      const es = new EventSource(`/api/jobs/${job_id}/events`);
      let finished = false;
      es.onmessage = (m) => {
        const ev = JSON.parse(m.data);
        if (ev.type === "progress") return setLog((l) => [...l, ev.message]);
        finished = true;
        es.close();
        if (ev.type === "done") {
          setResult({ ...ev, topic: t, email: em });
          setPhase("done");
          window.scrollTo({ top: 0, behavior: "smooth" });
        } else {
          setError("Something went wrong: " + ev.message);
          setPhase("form");
        }
      };
      es.onerror = () => {
        es.close();
        if (!finished) { setError("Lost connection to the server."); setPhase("form"); }
      };
    } catch (x) {
      setError((x as Error).message);
    }
    setBusy(false);
  }

  return (
    <>
      <div className="glow g1" /><div className="glow g2" />
      <main>
        <header>
          <div className="logo">
            <svg width="30" height="30" viewBox="0 0 32 32"><defs><linearGradient id="g"><stop stopColor="#818cf8" /><stop offset="1" stopColor="#22d3ee" /></linearGradient></defs><circle cx="14" cy="14" r="9" fill="none" stroke="url(#g)" strokeWidth="3.5" /><path d="M21 21l7 7" stroke="#06b6d4" strokeWidth="3.5" strokeLinecap="round" /></svg>
            WebScope
          </div>
        </header>

        <section hidden={phase !== "form"}>
          <h1>Any topic.<br /><span>A researched report</span> in your inbox.</h1>
          <p className="sub">WebScope searches the web, reads the sources, writes a cited report, and emails you a PDF with a short summary.</p>
          <form ref={form} onSubmit={submit} autoComplete="off">
            <div className="field">
              <label htmlFor="topic">What should we research?</label>
              <textarea id="topic" rows={2} maxLength={300} required value={topic} placeholder="e.g. The state of solid-state batteries for EVs"
                onChange={(e) => setTopic(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); form.current?.requestSubmit(); } }} />
            </div>
            <div className="chips">
              {EXAMPLES.map((x) => <button key={x} type="button" onClick={() => setTopic(x)}>{x}</button>)}
            </div>
            <div className="field">
              <label htmlFor="email">Send the PDF to <span className="opt">(optional)</span></label>
              <input id="email" type="email" placeholder="you@gmail.com" value={email} onChange={(e) => setEmail(e.target.value)} />
              {cfg && <small>{cfg.mail ? "We'll email you the PDF and a short summary." : "Email isn't configured on this server yet — you can still download the PDF."}</small>}
            </div>
            <button className="primary" type="submit" disabled={busy}>
              <span>Start research</span>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
            </button>
            {err && <p className="err">{err}</p>}
          </form>
        </section>

        {phase === "running" && (
          <section className="card">
            <div className="ptitle"><div className="spinner" /><div><h2>{topic}</h2><p>This takes about a minute.</p></div></div>
            <ul id="log">{log.map((m, i) => <li key={i} className={i < log.length - 1 ? "done" : ""}>{m}</li>)}</ul>
          </section>
        )}

        {phase === "done" && result && (
          <section>
            <div className="card">
              <div className="rhead">
                <div><span className="badge">Report ready</span><h2>{result.topic}</h2></div>
                <div className="actions">
                  <a className="primary" href={result.pdfUrl} download>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v12m0 0l-5-5m5 5l5-5M5 21h14" /></svg>Download PDF
                  </a>
                  <button className="ghost" type="button" onClick={() => setPhase("form")}>New research</button>
                </div>
              </div>
              <MailStatus mail={result.mail} to={result.email} />
              <h3>Summary</h3>
              <p className="summary">{result.summary}</p>
            </div>
            <details className="card" open>
              <summary>Full report</summary>
              <article><Markdown text={result.report} /></article>
            </details>
          </section>
        )}

        <footer>Powered by Groq · LangGraph · DuckDuckGo</footer>
      </main>
    </>
  );
}

function MailStatus({ mail, to }: { mail: string; to: string }) {
  if (mail === "skipped") return null;
  if (mail === "sent") return <p className="mail">✉️ Sent to {to} with the PDF attached.</p>;
  return (
    <p className="mail bad">
      {mail === "not_configured"
        ? "Email isn't configured on the server, so nothing was sent. Download the PDF instead."
        : `Email couldn't be sent (${mail.replace("failed: ", "")}). You can still download the PDF.`}
    </p>
  );
}
