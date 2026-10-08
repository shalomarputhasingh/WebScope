import re
import uuid
from datetime import date
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.enums import TA_JUSTIFY
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import cm
from reportlab.platypus import HRFlowable, ListFlowable, ListItem, Paragraph, SimpleDocTemplate, Spacer

from . import config

INDIGO = colors.HexColor("#4f46e5")
INK = colors.HexColor("#1f2937")


def _inline(text: str) -> str:
    t = escape(text)
    t = re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", t)
    t = re.sub(r"(?<![\w*])\*(?!\s)(.+?)(?<!\s)\*(?![\w*])", r"<i>\1</i>", t)
    t = re.sub(r"(?<![\w])_(.+?)_(?![\w])", r"<i>\1</i>", t)
    t = re.sub(r"\[(\d+)\]", r'<font color="#4f46e5" size="8"><super>[\1]</super></font>', t)
    t = re.sub(r"(https?://[^\s<]+)", r'<link href="\1" color="#4f46e5">\1</link>', t)
    return t


def _footer(canvas, doc):
    canvas.saveState()
    canvas.setFont("Helvetica", 8)
    canvas.setFillColor(colors.HexColor("#9ca3af"))
    canvas.drawString(2 * cm, 1.2 * cm, "WebScope - AI research report")
    canvas.drawRightString(A4[0] - 2 * cm, 1.2 * cm, f"Page {doc.page}")
    canvas.restoreState()


def build_pdf(topic: str, md: str, summary: str):
    path = config.REPORTS_DIR / f"{uuid.uuid4().hex[:12]}.pdf"
    ss = getSampleStyleSheet()
    body = ParagraphStyle("b", parent=ss["BodyText"], fontName="Helvetica", fontSize=10.5, leading=16, textColor=INK, alignment=TA_JUSTIFY, spaceAfter=8)
    h1 = ParagraphStyle("h1", parent=ss["Title"], fontName="Helvetica-Bold", fontSize=26, leading=31, textColor=INDIGO, alignment=0, spaceAfter=4)
    h2 = ParagraphStyle("h2", parent=ss["Heading2"], fontName="Helvetica-Bold", fontSize=15, leading=19, textColor=INDIGO, spaceBefore=16, spaceAfter=6)
    meta = ParagraphStyle("m", parent=body, fontSize=9, textColor=colors.HexColor("#6b7280"), spaceAfter=10)
    src = ParagraphStyle("s", parent=body, fontSize=8.5, leading=12, alignment=0, spaceAfter=4)

    flow, bullets, in_sources = [], [], False

    def flush():
        if bullets:
            flow.append(ListFlowable([ListItem(Paragraph(_inline(b), body), leftIndent=14) for b in bullets], bulletType="bullet", bulletColor=INDIGO, leftIndent=14))
            bullets.clear()

    for line in md.splitlines():
        s = line.strip()
        if not s:
            flush()
            continue
        if s.startswith("# "):
            flow += [Paragraph(_inline(s[2:]), h1), Paragraph(f"Research report · {date.today():%B %d, %Y}", meta),
                     HRFlowable(width="100%", thickness=1.2, color=INDIGO, spaceAfter=6)]
        elif s.startswith("## "):
            flush()
            in_sources = s[3:].strip().lower() == "sources"
            flow.append(Paragraph(_inline(s[3:]), h2))
        elif s.startswith("### "):
            flush()
            flow.append(Paragraph(f"<b>{_inline(s[4:])}</b>", body))
        elif re.match(r"^[-*•]\s+", s):
            bullets.append(re.sub(r"^[-*•]\s+", "", s))
        elif re.match(r"^\d+\.\s+", s) and not in_sources:
            bullets.append(re.sub(r"^\d+\.\s+", "", s))
        else:
            flush()
            flow.append(Paragraph(_inline(s), src if in_sources else body))
    flush()
    SimpleDocTemplate(str(path), pagesize=A4, leftMargin=2 * cm, rightMargin=2 * cm, topMargin=2 * cm, bottomMargin=2 * cm,
                      title=f"WebScope: {topic}", author="WebScope").build(flow, onFirstPage=_footer, onLaterPages=_footer)
    return path
