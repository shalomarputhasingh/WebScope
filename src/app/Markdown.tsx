import type { ReactNode } from "react";

// Minimal, XSS-safe renderer: React escapes all text; we only build elements.
function inline(text: string): ReactNode[] {
  const parts: ReactNode[] = [];
  const re = /\*\*(.+?)\*\*|\[(\d+)\]|(https?:\/\/[^\s<]+)/g;
  let last = 0, m: RegExpExecArray | null, k = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    if (m[1]) parts.push(<b key={k++}>{m[1]}</b>);
    else if (m[2]) parts.push(<sup key={k++}>[{m[2]}]</sup>);
    else parts.push(<a key={k++} href={m[3]} target="_blank" rel="noopener noreferrer">{m[3]}</a>);
    last = re.lastIndex;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

export default function Markdown({ text }: { text: string }) {
  const out: ReactNode[] = [];
  let items: string[] = [];
  const flush = () => {
    if (items.length) out.push(<ul key={out.length}>{items.map((t, i) => <li key={i}>{inline(t)}</li>)}</ul>);
    items = [];
  };
  for (const raw of text.split("\n")) {
    const l = raw.trim();
    if (!l) { flush(); continue; }
    if (/^[-*•]\s+/.test(l)) { items.push(l.replace(/^[-*•]\s+/, "")); continue; }
    flush();
    const key = out.length;
    if (l.startsWith("# ")) out.push(<h1 key={key}>{inline(l.slice(2))}</h1>);
    else if (l.startsWith("## ")) out.push(<h2 key={key}>{inline(l.slice(3))}</h2>);
    else out.push(<p key={key} className={/^\[\d+\] /.test(l) ? "src" : undefined}>{inline(l)}</p>);
  }
  flush();
  return <>{out}</>;
}
