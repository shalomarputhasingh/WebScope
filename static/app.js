const $ = (id) => document.getElementById(id);
const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

fetch("/api/config").then((r) => r.json()).then((c) => {
  if (!c.groq) showErr("Server is missing GROQ_API_KEY — add it to .env and restart.");
  $("mailhint").textContent = c.mail ? "We'll email you the PDF and a short summary." : "Email isn't configured on this server yet — you can still download the PDF.";
});

$("chips").addEventListener("click", (e) => {
  if (e.target.tagName === "BUTTON") { $("topic").value = e.target.textContent; $("topic").focus(); }
});
$("topic").addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); $("form").requestSubmit(); }
});
$("again").onclick = () => { $("result").hidden = true; $("hero").hidden = false; $("topic").focus(); };

function showErr(m) { $("err").textContent = m; $("err").hidden = !m; }

// minimal safe markdown renderer
function md(text) {
  const out = []; let list = false;
  const inline = (t) => esc(t).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/\[(\d+)\]/g, "<sup>[$1]</sup>")
    .replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');
  for (const raw of text.split("\n")) {
    const l = raw.trim();
    const close = () => { if (list) { out.push("</ul>"); list = false; } };
    if (!l) { close(); continue; }
    if (/^[-*•]\s+/.test(l)) { if (!list) { out.push("<ul>"); list = true; } out.push(`<li>${inline(l.replace(/^[-*•]\s+/, ""))}</li>`); continue; }
    close();
    if (l.startsWith("# ")) out.push(`<h1>${inline(l.slice(2))}</h1>`);
    else if (l.startsWith("## ")) out.push(`<h2>${inline(l.slice(3))}</h2>`);
    else out.push(`<p${/^\[\d+\] /.test(l) ? ' class="src"' : ""}>${inline(l)}</p>`);
  }
  if (list) out.push("</ul>");
  return out.join("");
}

$("form").addEventListener("submit", async (e) => {
  e.preventDefault(); showErr("");
  const topic = $("topic").value.trim(), email = $("email").value.trim();
  const btn = $("go"); btn.disabled = true;
  try {
    const r = await fetch("/api/research", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ topic, email: email || null }) });
    if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(typeof j.detail === "string" ? j.detail : "Please check the topic and email address."); }
    const { job_id } = await r.json();
    $("hero").hidden = true; $("result").hidden = true; $("progress").hidden = false;
    $("ptopic").textContent = topic; $("log").innerHTML = "";
    const es = new EventSource(`/api/jobs/${job_id}/events`);
    es.onmessage = (m) => {
      const ev = JSON.parse(m.data);
      if (ev.type === "progress") {
        const last = $("log").lastElementChild; if (last) last.classList.add("done");
        const li = document.createElement("li"); li.textContent = ev.message; $("log").appendChild(li);
      } else { es.close(); $("progress").hidden = true; ev.type === "done" ? finish(topic, ev) : fail(ev.message); }
    };
    es.onerror = () => { es.close(); if (!$("progress").hidden) fail("Lost connection to the server."); };
  } catch (err) { showErr(err.message); }
  btn.disabled = false;
});

function fail(msg) { $("hero").hidden = false; showErr("Something went wrong: " + msg); }

function finish(topic, ev) {
  $("rtopic").textContent = topic; $("summary").textContent = ev.summary;
  $("report").innerHTML = md(ev.report); $("dl").href = ev.pdf_url;
  const m = $("mailstatus"); m.className = "mail";
  const to = $("email").value.trim();
  if (ev.mail === "sent") m.textContent = `✉️ Sent to ${to} with the PDF attached.`;
  else if (ev.mail === "skipped") m.hidden = true;
  else { m.classList.add("bad"); m.textContent = ev.mail === "not_configured" ? "Email isn't configured on the server, so nothing was sent. Download the PDF instead." : "Email couldn't be sent (" + ev.mail.replace("failed: ", "") + "). You can still download the PDF."; }
  if (ev.mail !== "skipped") m.hidden = false;
  $("result").hidden = false; window.scrollTo({ top: 0, behavior: "smooth" });
}
