import smtplib
import ssl
from email.message import EmailMessage
from email.utils import formataddr
from html import escape
from pathlib import Path

from . import config


def send_report(to: str, topic: str, summary: str, pdf_path: str) -> None:
    msg = EmailMessage()
    msg["Subject"] = f"WebScope report: {topic}"
    msg["From"] = formataddr((config.MAIL_FROM_NAME, config.SMTP_USER))
    msg["To"] = to
    msg.set_content(f"Your WebScope research report on \"{topic}\" is attached.\n\nSummary\n-------\n{summary}\n")
    msg.add_alternative(
        f"""<div style="font-family:Segoe UI,Arial,sans-serif;max-width:560px;margin:auto;color:#1f2937">
<div style="background:linear-gradient(135deg,#6366f1,#06b6d4);padding:22px 26px;border-radius:14px 14px 0 0">
<div style="color:#fff;font-size:13px;letter-spacing:.12em;text-transform:uppercase;opacity:.85">WebScope</div>
<div style="color:#fff;font-size:22px;font-weight:700;margin-top:4px">{escape(topic)}</div></div>
<div style="border:1px solid #e5e7eb;border-top:0;padding:24px 26px;border-radius:0 0 14px 14px">
<p style="margin:0 0 6px;font-weight:600">Summary</p>
<p style="line-height:1.65;margin:0 0 18px">{escape(summary)}</p>
<p style="margin:0;color:#6b7280;font-size:14px">📎 The full report is attached as a PDF.</p></div></div>""",
        subtype="html",
    )
    p = Path(pdf_path)
    msg.add_attachment(p.read_bytes(), maintype="application", subtype="pdf", filename=p.name)
    ctx = ssl.create_default_context()
    with smtplib.SMTP_SSL(config.SMTP_HOST, config.SMTP_PORT, context=ctx, timeout=30) as s:
        s.login(config.SMTP_USER, config.SMTP_PASSWORD)
        s.send_message(msg)
