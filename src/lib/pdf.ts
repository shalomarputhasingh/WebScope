import PDFDocument from "pdfkit";

const INDIGO = "#4f46e5";
const INK = "#1f2937";
const GREY = "#6b7280";

type Run = { text: string; bold?: boolean; italic?: boolean; cite?: boolean; link?: string };

/** Tokenise **bold**, *italic*, [n] citations and bare URLs. */
function runs(line: string): Run[] {
  const out: Run[] = [];
  const re = /\*\*(.+?)\*\*|(?<![\w*])\*(?!\s)(.+?)(?<!\s)\*(?![\w*])|\[(\d+)\]|(https?:\/\/[^\s]+)/g;
  let last = 0, m: RegExpExecArray | null;
  while ((m = re.exec(line))) {
    if (m.index > last) out.push({ text: line.slice(last, m.index) });
    if (m[1]) out.push({ text: m[1], bold: true });
    else if (m[2]) out.push({ text: m[2], italic: true });
    else if (m[3]) out.push({ text: `[${m[3]}]`, cite: true });
    else out.push({ text: m[4], link: m[4] });
    last = re.lastIndex;
  }
  if (last < line.length) out.push({ text: line.slice(last) });
  return out;
}

function write(doc: PDFKit.PDFDocument, line: string, opts: { size: number; x?: number; width?: number; gap?: number; align?: "left" | "justify" }) {
  const rs = runs(line);
  rs.forEach((r, i) => {
    const font = r.bold ? "Helvetica-Bold" : r.italic ? "Helvetica-Oblique" : "Helvetica";
    doc.font(font).fontSize(opts.size).fillColor(r.cite || r.link ? INDIGO : INK);
    const last = i === rs.length - 1;
    const o: PDFKit.Mixins.TextOptions = { continued: !last, lineGap: 3, width: opts.width };
    if (r.link) o.link = r.link;
    if (i === 0) doc.text(r.text, opts.x ?? doc.page.margins.left, doc.y, o);
    else doc.text(r.text, o);
  });
  if (!rs.length) doc.text("");
  doc.moveDown(opts.gap ?? 0.5);
}

export function buildPdf(topic: string, md: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 57, bufferPages: true, info: { Title: `WebScope: ${topic}`, Author: "WebScope" } });
    const chunks: Buffer[] = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const left = doc.page.margins.left;
    const width = doc.page.width - left - doc.page.margins.right;
    let inSources = false;

    for (const raw of md.split("\n")) {
      const s = raw.trim();
      if (!s) continue;
      if (s.startsWith("# ")) {
        doc.font("Helvetica-Bold").fontSize(26).fillColor(INDIGO).text(s.slice(2), left, undefined, { width });
        const d = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
        doc.moveDown(0.2).font("Helvetica").fontSize(9).fillColor(GREY).text(`Research report · ${d}`);
        doc.moveDown(0.5);
        doc.moveTo(left, doc.y).lineTo(left + width, doc.y).lineWidth(1.2).strokeColor(INDIGO).stroke();
        doc.moveDown(0.8);
      } else if (s.startsWith("## ")) {
        inSources = s.slice(3).trim().toLowerCase() === "sources";
        doc.moveDown(0.6);
        if (doc.y > doc.page.height - 120) doc.addPage();
        doc.font("Helvetica-Bold").fontSize(15).fillColor(INDIGO).text(s.slice(3), left, undefined, { width });
        doc.moveDown(0.4);
      } else if (/^[-*•]\s+/.test(s)) {
        const y = doc.y;
        doc.circle(left + 5, y + 6, 1.8).fill(INDIGO);
        doc.y = y;
        write(doc, s.replace(/^[-*•]\s+/, ""), { size: 10.5, x: left + 16, width: width - 16, gap: 0.3 });
      } else if (inSources) {
        write(doc, s, { size: 8.5, x: left, width, gap: 0.2 });
      } else {
        write(doc, s, { size: 10.5, x: left, width });
      }
    }

    // footer on every page
    const range = doc.bufferedPageRange();
    for (let i = 0; i < range.count; i++) {
      doc.switchToPage(range.start + i);
      const y = doc.page.height - 40;
      doc.page.margins.bottom = 0; // allow drawing inside the bottom margin without spawning a page
      doc.font("Helvetica").fontSize(8).fillColor("#9ca3af");
      doc.text("WebScope - AI research report", left, y, { width: width / 2, lineBreak: false });
      doc.text(`Page ${i + 1} of ${range.count}`, left + width / 2, y, { width: width / 2, align: "right", lineBreak: false });
    }
    doc.end();
  });
}
