// Verifies your Gmail SMTP settings without sending anything:  npm run check:mail
import nextEnv from "@next/env";
import nodemailer from "nodemailer";

nextEnv.loadEnvConfig(process.cwd());
const clean = (v = "") => v.trim().replace(/^(["'])(.*)\1$/, "$2").trim();

const user = clean(process.env.SMTP_USER);
const pass = clean(process.env.SMTP_PASSWORD).replace(/\s/g, "");
const host = clean(process.env.SMTP_HOST) || "smtp.gmail.com";
const port = Number(clean(process.env.SMTP_PORT) || 465);

if (!user || !pass) {
  console.error("✗ SMTP_USER / SMTP_PASSWORD are not set (put them in .env.local).");
  process.exit(1);
}
console.log(`Checking ${user} on ${host}:${port} (password: ${pass.length} chars after removing spaces)…`);
if (pass.length !== 16) console.warn("! Gmail App Passwords are 16 characters — double-check what you pasted.");

try {
  await nodemailer.createTransport({ host, port, secure: port === 465, auth: { user, pass } }).verify();
  console.log("✓ Login works. WebScope can send email.");
} catch (e) {
  console.error("✗ Login failed:", e.message);
  console.error("  Make sure 2-Step Verification is on and you used an App Password, not your Gmail password.");
  process.exit(1);
}
