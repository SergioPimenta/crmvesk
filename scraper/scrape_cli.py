#!/usr/bin/env python3
"""CLI — retorna JSON no stdout para o backend Node invocar."""
import argparse
import json
import sys

from maps_scraper import scrape_google_maps


def main() -> int:
    parser = argparse.ArgumentParser(description="Google Maps scraper (gratuito)")
    parser.add_argument("--query", required=True)
    parser.add_argument("--limit", type=int, default=30)
    parser.add_argument("--headless", action="store_true", default=False)
    parser.add_argument("--no-headless", action="store_true")
    parser.add_argument("--only-with-phone", action="store_true")
    args = parser.parse_args()

    headless = args.headless or not args.no_headless

    try:
        results = scrape_google_maps(
            query=args.query,
            limit=args.limit,
            headless=headless,
            only_with_phone=args.only_with_phone,
        )
        payload = {
            "query": args.query.strip(),
            "total": len(results),
            "results": results,
            "source": "python-playwright",
        }
        sys.stdout.write(json.dumps(payload, ensure_ascii=False))
        return 0
    except Exception as exc:
        sys.stderr.write(str(exc))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
