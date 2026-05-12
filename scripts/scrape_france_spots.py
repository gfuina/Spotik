#!/usr/bin/env python3
"""
Scrape calisthenics-parks.com spots for France (entity fr-fr-france).
See plan: country page provides `x` token; list API is JSON; detail is HTML.
"""

from __future__ import annotations

import argparse
import json
import random
import re
import sys
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any
from urllib.parse import urljoin

import httpx
from bs4 import BeautifulSoup

BASE = "https://calisthenics-parks.com"
DEFAULT_COUNTRY_URL = f"{BASE}/countries/fr-fr-france"

JSON_HEADERS = {
    "Accept": "application/json",
    "X-Requested-With": "XMLHttpRequest",
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    ),
    "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.8",
}

HTML_HEADERS = {
    "Accept": "text/html,application/xhtml+xml",
    "User-Agent": JSON_HEADERS["User-Agent"],
    "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.8",
}

X_TOKEN_RE = re.compile(
    r"""s\s*:\s*['\"]bubble['\"][^}]*?['\"]x['\"]\s*:\s*['\"]([a-f0-9]{32})['\"]""",
    re.IGNORECASE | re.DOTALL,
)
X_TOKEN_FALLBACK = re.compile(r"""['\"]x['\"]\s*:\s*['\"]([a-f0-9]{32})['\"]""")
SPOT_URL_IN_HTML = re.compile(
    r"https://calisthenics-parks\.com/spots/\d+[^\"'\s<>]*", re.I
)
IMG_SRC_RE = re.compile(r'src="(https://calisthenics-parks\.com/[^"]+)"', re.I)


def sleep_delay(seconds: float) -> None:
    if seconds > 0:
        time.sleep(seconds)


def request_with_retries(
    client: httpx.Client,
    method: str,
    url: str,
    *,
    headers: dict[str, str],
    params: dict[str, Any] | None = None,
    max_retries: int = 5,
    backoff_base: float = 1.5,
) -> httpx.Response:
    last_exc: Exception | None = None
    for attempt in range(max_retries):
        try:
            r = client.request(method, url, headers=headers, params=params)
            if r.status_code == 429 or r.status_code >= 500:
                wait = backoff_base ** attempt + random.uniform(0, 0.5)
                time.sleep(wait)
                continue
            r.raise_for_status()
            return r
        except (httpx.TransportError, httpx.TimeoutException) as e:
            last_exc = e
            wait = backoff_base ** attempt + random.uniform(0, 0.5)
            time.sleep(wait)
    if last_exc:
        raise last_exc
    raise RuntimeError(f"Failed after {max_retries} retries: {url}")


def extract_x_token(html: str) -> str:
    m = X_TOKEN_RE.search(html)
    if m:
        return m.group(1)
    m = X_TOKEN_FALLBACK.search(html)
    if m:
        return m.group(1)
    raise RuntimeError(
        "Could not find map token `x` in country page HTML. "
        "Site markup may have changed."
    )


def fetch_country_html(
    client: httpx.Client, country_url: str, *, max_retries: int = 5
) -> str:
    r = request_with_retries(
        client, "GET", country_url, headers=HTML_HEADERS, max_retries=max_retries
    )
    return r.text


def fetch_spots_page(
    client: httpx.Client,
    x: str,
    page: int,
    limit: int,
    *,
    max_retries: int = 5,
) -> dict[str, Any]:
    url = f"{BASE}/spots/"
    r = request_with_retries(
        client,
        "GET",
        url,
        headers=JSON_HEADERS,
        max_retries=max_retries,
        params={"limit": limit, "page": page, "x": x},
    )
    return r.json()


def first_spot_url_from_list_html(html_obj: dict[str, Any] | str | None) -> str | None:
    if not html_obj:
        return None
    if isinstance(html_obj, dict):
        blob = html_obj.get("l") or html_obj.get("m") or ""
    else:
        blob = str(html_obj)
    m = SPOT_URL_IN_HTML.search(blob)
    return m.group(0) if m else None


def first_thumbnail_from_list_html(html_obj: dict[str, Any] | str | None) -> str | None:
    if not html_obj or not isinstance(html_obj, dict):
        return None
    blob = html_obj.get("l") or html_obj.get("m") or ""
    m = IMG_SRC_RE.search(blob)
    return m.group(1) if m else None


def collect_all_list_items(
    client: httpx.Client,
    x: str,
    limit: int,
    delay: float,
    *,
    max_retries: int = 5,
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    first = fetch_spots_page(client, x, 1, limit, max_retries=max_retries)
    paginator = first.get("paginator") or {}
    total_pages = int(paginator.get("total_pages", 1))
    items: list[dict[str, Any]] = list(first.get("data") or [])
    sleep_delay(delay)
    for page in range(2, total_pages + 1):
        data = fetch_spots_page(client, x, page, limit, max_retries=max_retries)
        items.extend(data.get("data") or [])
        sleep_delay(delay)
    return items, paginator


def normalize_scheme(url: str) -> str:
    if url.startswith("//"):
        return "https:" + url
    return url


def parse_spot_detail(html: str, final_url: str) -> dict[str, Any]:
    soup = BeautifulSoup(html, "lxml")

    meta_desc = None
    md = soup.find("meta", attrs={"name": "description"})
    if md and md.get("content"):
        meta_desc = md["content"]

    og: dict[str, str] = {}
    for prop in ("title", "description", "image", "url", "type", "locale"):
        tag = soup.find("meta", attrs={"property": f"og:{prop}"})
        if tag and tag.get("content"):
            og[prop] = normalize_scheme(tag["content"])

    canonical = None
    link_c = soup.find("link", attrs={"rel": "canonical"})
    if link_c and link_c.get("href"):
        canonical = normalize_scheme(link_c["href"])

    hreflang_urls: dict[str, str] = {}
    for link in soup.find_all("link", attrs={"rel": "alternate"}):
        hl = link.get("hreflang")
        href = link.get("href")
        if hl and href:
            hreflang_urls[hl] = normalize_scheme(href)

    breadcrumb: list[dict[str, str]] = []
    for li in soup.select("ol.breadcrumb li[itemprop=itemListElement]"):
        a = li.find("a", itemprop="item")
        span = li.find("span", itemprop="name")
        if a and span:
            breadcrumb.append(
                {
                    "name": span.get_text(strip=True),
                    "url": normalize_scheme(a.get("href", "")),
                }
            )

    equipments: list[dict[str, str]] = []
    sec_eq = soup.find("section", id="equipment")
    if sec_eq:
        for a in sec_eq.find_all("a", href=True):
            href = normalize_scheme(urljoin(BASE, a["href"]))
            if "/equipments/" in href:
                equipments.append(
                    {
                        "title": (a.get("title") or a.get_text(strip=True) or ""),
                        "url": href,
                    }
                )

    disciplines: list[dict[str, str]] = []
    container = soup.find(id="content-l-container")
    if container:
        for a in container.find_all("a", href=True):
            href = normalize_scheme(urljoin(BASE, a["href"]))
            if "/disciplines/" in href and href not in {d["url"] for d in disciplines}:
                disciplines.append(
                    {
                        "title": (a.get("title") or a.get_text(strip=True) or ""),
                        "url": href,
                    }
                )

    photo_urls: list[str] = []
    seen: set[str] = set()
    for a in soup.select('a[data-gallery][href*="attachments"]'):
        href = normalize_scheme(urljoin(BASE, a["href"]))
        if href not in seen:
            seen.add(href)
            photo_urls.append(href)

    main_text_parts: list[str] = []
    panel = soup.select_one("#content-l-container .panel .panel-body")
    if panel:
        for p in panel.find_all("p"):
            t = p.get_text(" ", strip=True)
            if t:
                main_text_parts.append(t)

    return {
        "final_url": final_url,
        "canonical_url": canonical,
        "meta_description": meta_desc,
        "og": og,
        "hreflang_urls": hreflang_urls,
        "breadcrumb": breadcrumb,
        "equipments": equipments,
        "disciplines": disciplines,
        "photo_urls": photo_urls,
        "main_text_paragraphs": main_text_parts,
    }


def load_done_ids_from_jsonl(path: str) -> set[int]:
    done: set[int] = set()
    try:
        with open(path, encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    obj = json.loads(line)
                    sid = obj.get("id")
                    if isinstance(sid, int) and "detail" in obj:
                        done.add(sid)
                except json.JSONDecodeError:
                    continue
    except FileNotFoundError:
        pass
    return done


def append_jsonl(path: str, obj: dict[str, Any]) -> None:
    with open(path, "a", encoding="utf-8") as f:
        f.write(json.dumps(obj, ensure_ascii=False) + "\n")


@dataclass
class Args:
    country_url: str = DEFAULT_COUNTRY_URL
    out: str = "spots_france.json"
    partial: str = "spots_france.partial.jsonl"
    limit: int = 100
    delay: float = 0.35
    resume: bool = False
    max_retries: int = 5
    list_only: bool = False


def parse_cli(argv: list[str] | None = None) -> Args:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument(
        "--country-url",
        default=DEFAULT_COUNTRY_URL,
        help="Country page URL (default: France fr-fr)",
    )
    p.add_argument(
        "--out",
        default="spots_france.json",
        help="Final JSON output path",
    )
    p.add_argument(
        "--partial",
        default="spots_france.partial.jsonl",
        help="Append-only JSONL for resume",
    )
    p.add_argument("--limit", type=int, default=100, help="Page size for list API")
    p.add_argument(
        "--delay",
        type=float,
        default=0.35,
        help="Delay in seconds between requests (after each list/detail call)",
    )
    p.add_argument(
        "--resume",
        action="store_true",
        help="Skip spot ids already present in --partial JSONL",
    )
    p.add_argument("--max-retries", type=int, default=5)
    p.add_argument(
        "--list-only",
        action="store_true",
        help="Only fetch and write list (no detail HTML scrape)",
    )
    ns = p.parse_args(argv)
    return Args(
        country_url=ns.country_url,
        out=ns.out,
        partial=ns.partial,
        limit=ns.limit,
        delay=ns.delay,
        resume=ns.resume,
        max_retries=ns.max_retries,
        list_only=ns.list_only,
    )


def main(argv: list[str] | None = None) -> int:
    args = parse_cli(argv)
    timeout = httpx.Timeout(60.0, connect=30.0)

    with httpx.Client(timeout=timeout, follow_redirects=True) as client:
        country_html = fetch_country_html(
            client, args.country_url, max_retries=args.max_retries
        )
        x = extract_x_token(country_html)
        print(f"Extracted map token x={x}", file=sys.stderr)

        list_items, paginator = collect_all_list_items(
            client,
            x,
            args.limit,
            args.delay,
            max_retries=args.max_retries,
        )
        print(
            f"List: {len(list_items)} rows, paginator={paginator}",
            file=sys.stderr,
        )

        by_id: dict[int, dict[str, Any]] = {}
        for row in list_items:
            sid = row.get("id")
            if not isinstance(sid, int):
                continue
            html_block = row.get("html")
            list_url = first_spot_url_from_list_html(html_block)
            thumb = first_thumbnail_from_list_html(html_block)
            by_id[sid] = {
                "id": sid,
                "name": row.get("name"),
                "title": row.get("title"),
                "lat": row.get("lat"),
                "lon": row.get("lon"),
                "address": row.get("address"),
                "list_thumbnail_url": thumb,
                "list_spot_url": list_url,
            }

        spots_sorted = sorted(by_id.values(), key=lambda s: s["id"])

        if args.list_only:
            payload = {
                "scraped_at": datetime.now(timezone.utc).isoformat(),
                "source": BASE,
                "country_url": args.country_url,
                "map_token_x": x,
                "paginator": paginator,
                "spots": spots_sorted,
            }
            with open(args.out, "w", encoding="utf-8") as f:
                json.dump(payload, f, ensure_ascii=False, indent=2)
            print(f"Wrote list-only {args.out}", file=sys.stderr)
            return 0

        done_ids = load_done_ids_from_jsonl(args.partial) if args.resume else set()
        if args.resume and done_ids:
            print(f"Resume: skipping {len(done_ids)} ids from {args.partial}", file=sys.stderr)
        elif not args.resume:
            try:
                open(args.partial, "w", encoding="utf-8").close()
            except OSError:
                pass

        for s in spots_sorted:
            sid = s["id"]
            if sid in done_ids:
                continue
            url = f"{BASE}/spots/{sid}"
            r = request_with_retries(
                client,
                "GET",
                url,
                headers=HTML_HEADERS,
                max_retries=args.max_retries,
            )
            detail = parse_spot_detail(r.text, str(r.url))
            merged = {**s, "detail": detail}
            append_jsonl(args.partial, merged)
            done_ids.add(sid)
            sleep_delay(args.delay)

        # Reload all partial lines for final merge (handles resume + order)
        merged_by_id: dict[int, dict[str, Any]] = {s["id"]: dict(s) for s in spots_sorted}
        try:
            with open(args.partial, encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if not line:
                        continue
                    obj = json.loads(line)
                    i = obj.get("id")
                    if isinstance(i, int) and "detail" in obj:
                        base = merged_by_id.get(i, {"id": i})
                        base.update(obj)
                        merged_by_id[i] = base
        except FileNotFoundError:
            pass

        final_spots = [merged_by_id[i] for i in sorted(merged_by_id)]
        payload = {
            "scraped_at": datetime.now(timezone.utc).isoformat(),
            "source": BASE,
            "country_url": args.country_url,
            "map_token_x": x,
            "paginator": paginator,
            "spots": final_spots,
        }
        with open(args.out, "w", encoding="utf-8") as f:
            json.dump(payload, f, ensure_ascii=False, indent=2)
        print(f"Wrote {args.out} ({len(final_spots)} spots)", file=sys.stderr)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
