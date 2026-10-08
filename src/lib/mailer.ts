import nodemailer from "nodemailer";
import { config } from "./config";

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

export async function sendReport(to: string, topic: string, summary: string, pdf: Buffer) {
  const transport = nodemailer.createTransport({
    host: config.smtpHost(),
    port: config.smtpPort(),
    secure: config.smtpPort() === 465,
    auth: { user: config.smtpUser(), pass: config.smtpPassword() },
  });
  await transport.sendMail({
    from: { name: config.fromName(), address: config.smtpUser() },
    to,
    subject: `WebScope report: ${topic}`,
    text: `Your WebScope research report on "${topic}" is attached.\n\nSummary\n-------\n${summary}\n`,
    html: `<div style="font-family:Segoe UI,Arial,sans-serif;max-width:560px;margin:auto;color:#1f2937">
<div style="background:linear-gradient(135deg,#6366f1,#06b6d4);padding:22px 26px;border-radius:14px 14px 0 0">
<div style="color:#fff;font-size:13px;letter-spacing:.12em;text-transform:uppercase;opacity:.85">WebScope</div>
<div style="color:#fff;font-size:22px;font-weight:700;margin-top:4px">${esc(topic)}</div></div>
<div style="border:1px solid #e5e7eb;border-top:0;padding:24px 26px;border-radius:0 0 14px 14px">
<p style="margin:0 0 6px;font-weight:600">Summary</p>
<p style="line-height:1.65;margin:0 0 18px">${esc(summary)}</p>
<p style="margin:0;color:#6b7280;font-size:14px">📎 The full report is attached as a PDF.</p></div></div>`,
    attachments: [{ filename: "webscope-report.pdf", content: pdf, contentType: "application/pdf" }],
  });
}
