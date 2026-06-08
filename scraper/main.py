"""Serviço HTTP do scraper — rode com: uvicorn main:app --host 0.0.0.0 --port 8765"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from maps_scraper import scrape_google_maps

app = FastAPI(title="VESK Maps Scraper", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class SearchBody(BaseModel):
    query: str
    limit: int = Field(default=30, ge=1, le=60)
    headless: bool = True
    onlyWithPhone: bool = False


@app.get("/health")
def health():
    return {"ok": True, "engine": "python-playwright"}


@app.post("/search")
def search(body: SearchBody):
    results = scrape_google_maps(
        query=body.query,
        limit=body.limit,
        headless=body.headless,
        only_with_phone=body.onlyWithPhone,
    )
    return {
        "query": body.query.strip(),
        "total": len(results),
        "results": results,
        "source": "python-playwright",
    }
