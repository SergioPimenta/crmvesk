FROM mcr.microsoft.com/playwright/python:v1.49.1-jammy

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY maps_scraper.py main.py ./

ENV PORT=8765
EXPOSE 8765

CMD uvicorn main:app --host 0.0.0.0 --port ${PORT:-8765}
