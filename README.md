# WebScope

Enter a topic → AI researches the web → you get a cited report as a **PDF + short summary by email**.

**Stack:** LangGraph (pipeline) · Groq (LLM via `langchain-groq`) · DuckDuckGo (search, no key) · ReportLab (PDF) · Gmail SMTP · FastAPI + vanilla JS UI.

## Pipeline
`plan` → `research` (parallel search + page reading) → `write` (section by section, cited) → `summarize` → `make_pdf` → `email`

## Run
```bash
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env     # add GROQ_API_KEY and Gmail SMTP credentials
python run.py            # http://localhost:8000
```

- Groq key: https://console.groq.com/keys
- Gmail: enable 2-Step Verification, then create an **App Password** and put it in `SMTP_PASSWORD` (your normal password won't work).
- If SMTP isn't configured, the report is still generated and downloadable from the UI.
