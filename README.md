# WebScope

Enter a topic → AI researches the web → you get a cited report as a **PDF + short summary by email**.

**Stack:** Next.js 15 (App Router, TypeScript) · LangGraph.js · Groq (`@langchain/groq`) · Tavily search API (free tier) with a keyless Wikipedia fallback · PDFKit · Nodemailer (Gmail SMTP).

## Pipeline (`src/lib/graph.ts`)
`plan` → `research` (parallel search; APIs return clean text, no HTML scraping) → `write` (section by section, cited) → `summarize` → `make_pdf` → `send_email`

Progress streams to the UI over Server-Sent Events (`/api/jobs/[id]/events`).

## Run
```bash
npm install
cp .env.example .env.local   # add GROQ_API_KEY and Gmail SMTP credentials
npm run dev                  # http://localhost:3000
# production: npm run build && npm start
```

- Tavily key (free, 1,000 searches/month, no card): https://app.tavily.com — optional; without it only Wikipedia is searched.
- Groq key: https://console.groq.com/keys
- Gmail: enable 2-Step Verification, then create an **App Password** and put it in `SMTP_PASSWORD` (your normal password won't work).
- If SMTP isn't configured, the report is still generated and downloadable from the UI.

Jobs live in server memory (1 hour), so run on a long-lived Node server (not serverless).
