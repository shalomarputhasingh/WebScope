import asyncio
import json
import queue
import threading
import uuid
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, EmailStr, Field

from . import config
from .graph import build_graph

app = FastAPI(title="WebScope")
graph = build_graph()
jobs: dict[str, dict] = {}
STATIC = Path(__file__).resolve().parent.parent / "static"


class ResearchRequest(BaseModel):
    topic: str = Field(min_length=3, max_length=300)
    email: EmailStr | None = None


def run_job(job_id: str, req: ResearchRequest):
    job = jobs[job_id]
    q: queue.Queue = job["queue"]
    try:
        out = graph.invoke(
            {"topic": req.topic.strip(), "email": req.email or ""},
            {"configurable": {"emit": lambda m: q.put({"type": "progress", "message": m})}},
        )
        job["pdf"] = out["pdf_path"]
        q.put({
            "type": "done", "summary": out["summary"], "report": out["report_md"],
            "mail": out.get("mail_status", "skipped"), "pdf_url": f"/api/jobs/{job_id}/pdf",
            "sources": len(out["sources"]),
        })
    except Exception as e:
        q.put({"type": "error", "message": str(e)[:400]})
    finally:
        q.put(None)


@app.get("/api/config")
def get_config():
    return {"groq": bool(config.GROQ_API_KEY), "mail": config.mail_configured()}


@app.post("/api/research")
def start(req: ResearchRequest):
    if not config.GROQ_API_KEY:
        raise HTTPException(503, "GROQ_API_KEY is not set on the server. Add it to .env and restart.")
    job_id = uuid.uuid4().hex
    jobs[job_id] = {"queue": queue.Queue()}
    threading.Thread(target=run_job, args=(job_id, req), daemon=True).start()
    return {"job_id": job_id}


@app.get("/api/jobs/{job_id}/events")
async def events(job_id: str):
    job = jobs.get(job_id)
    if not job:
        raise HTTPException(404)

    async def gen():
        loop = asyncio.get_running_loop()
        while True:
            item = await loop.run_in_executor(None, job["queue"].get)
            if item is None:
                break
            yield f"data: {json.dumps(item)}\n\n"

    return StreamingResponse(gen(), media_type="text/event-stream", headers={"Cache-Control": "no-cache"})


@app.get("/api/jobs/{job_id}/pdf")
def pdf(job_id: str):
    path = jobs.get(job_id, {}).get("pdf")
    if not path:
        raise HTTPException(404)
    return FileResponse(path, media_type="application/pdf", filename="webscope-report.pdf")


@app.get("/")
def index():
    return FileResponse(STATIC / "index.html")


app.mount("/static", StaticFiles(directory=STATIC), name="static")
