"""Serviço HTTP do scraper — rode com: uvicorn main:app --host 0.0.0.0 --port 8765"""
import threading
import uuid
from datetime import datetime, timezone

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from maps_scraper import scrape_google_maps

app = FastAPI(title="VESK Maps Scraper", version="1.2.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

_jobs: dict[str, dict] = {}
_jobs_lock = threading.Lock()


class SearchBody(BaseModel):
    query: str
    limit: int = Field(default=10, ge=1, le=60)
    headless: bool = True
    onlyWithPhone: bool = False


def _run_job(job_id: str, body: SearchBody) -> None:
    try:
        results = scrape_google_maps(
            query=body.query,
            limit=body.limit,
            headless=body.headless,
            only_with_phone=body.onlyWithPhone,
            time_budget_seconds=100,
        )
        payload = {
            "status": "done",
            "query": body.query.strip(),
            "total": len(results),
            "results": results,
            "source": "python-playwright",
            "finishedAt": datetime.now(timezone.utc).isoformat(),
        }
    except Exception as exc:
        payload = {
            "status": "error",
            "message": str(exc),
            "finishedAt": datetime.now(timezone.utc).isoformat(),
        }

    with _jobs_lock:
        _jobs[job_id] = payload


@app.get("/health")
def health():
    return {"ok": True, "engine": "python-playwright", "version": "1.2.0"}


@app.post("/search/async")
def search_async(body: SearchBody):
    job_id = str(uuid.uuid4())
    with _jobs_lock:
        _jobs[job_id] = {
            "status": "running",
            "query": body.query.strip(),
            "startedAt": datetime.now(timezone.utc).isoformat(),
        }

    threading.Thread(target=_run_job, args=(job_id, body), daemon=True).start()
    return {"jobId": job_id, "status": "running"}


@app.get("/search/status/{job_id}")
def search_status(job_id: str):
    with _jobs_lock:
        job = _jobs.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job não encontrado")
    return job


@app.post("/search")
def search(body: SearchBody):
    results = scrape_google_maps(
        query=body.query,
        limit=body.limit,
        headless=body.headless,
        only_with_phone=body.onlyWithPhone,
        time_budget_seconds=100,
    )
    return {
        "query": body.query.strip(),
        "total": len(results),
        "results": results,
        "source": "python-playwright",
    }
