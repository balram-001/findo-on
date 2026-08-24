"""Enrich active_leads with phone numbers found on official company websites.

Rules:
1. Use a phone found on the company domain (homepage or Contact Us page) first.
2. Never treat marketplace or URL-shortener links as an official website.
3. If no website phone is found, retain the existing Maps/legacy number as fallback.

The command is read-only by default. Pass --apply only after reviewing its output.
"""

from __future__ import annotations

import argparse
import os
import re
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable
from urllib.parse import urljoin, urlparse

import requests
from bs4 import BeautifulSoup

try:
    from supabase import create_client
except ImportError as error:  # pragma: no cover - operational guard
    raise SystemExit("Install python dependencies first: pip install -r requirements.txt") from error


ALL_INDUSTRIES = [
    "Automobile & Auto Components",
    "Pharmaceuticals & Healthcare Manufacturing",
    "Chemical Manufacturing & Allied Industries",
    "Packaging, Plastics & Paper Manufacturing",
    "Food Processing & Agro Manufacturing",
]
MARKETPLACE_HOSTS = {
    "indiamart.com", "tradeindia.com", "justdial.com", "exportersindia.com",
    "facebook.com", "instagram.com", "linkedin.com",
}
SHORT_LINK_HOSTS = {"page.link", "bit.ly", "tinyurl.com", "t.co", "goo.gl"}
CONTACT_WORDS = ("contact", "contact-us", "contactus", "get-in-touch", "reach-us", "connect")
PHONE_PATTERN = re.compile(r"(?<!\d)(?:\+?91[\s.()-]*)?(?:0?[6-9]\d{9}|0?[1-9]\d{7,10})(?!\d)")
HEADERS = {"User-Agent": "LeadFlow-Data-Validator/1.0 (+website-contact-verification)"}


def load_local_env() -> None:
    """Load local development variables without adding a dotenv dependency."""
    for filename in (".env.local", ".env"):
        path = Path(filename)
        if not path.exists():
            continue
        for line in path.read_text(encoding="utf-8").splitlines():
            if not line or line.lstrip().startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def normalized_host(url: str) -> str:
    return urlparse(url).hostname.lower().removeprefix("www.") if urlparse(url).hostname else ""


def is_official_website(url: str | None) -> bool:
    if not url:
        return False
    parsed = urlparse(url)
    host = normalized_host(url)
    if parsed.scheme not in {"http", "https"} or not host:
        return False
    blocked = MARKETPLACE_HOSTS | SHORT_LINK_HOSTS
    return not any(host == domain or host.endswith(f".{domain}") for domain in blocked)


def normalize_indian_phone(raw: str) -> str | None:
    digits = re.sub(r"\D", "", raw)
    if digits.startswith("91") and len(digits) > 10:
        digits = digits[2:]
    digits = digits.lstrip("0")
    if len(digits) == 10 and digits[0] in "6789":
        return f"+91 {digits}"
    if 8 <= len(digits) <= 11:
        return f"0{digits}"
    return None


def extract_phones(soup: BeautifulSoup) -> list[str]:
    values: list[str] = []
    for tag in soup.select('a[href^="tel:"]'):
        value = normalize_indian_phone(tag.get("href", "").removeprefix("tel:"))
        if value:
            values.append(value)
    visible_text = soup.get_text(" ", strip=True)
    for match in PHONE_PATTERN.findall(visible_text):
        value = normalize_indian_phone(match)
        if value:
            values.append(value)
    return list(dict.fromkeys(values))


def contact_page_urls(home_url: str, soup: BeautifulSoup) -> Iterable[str]:
    home_host = normalized_host(home_url)
    for anchor in soup.find_all("a", href=True):
        href = anchor["href"].strip()
        label = f"{anchor.get_text(' ', strip=True)} {href}".lower()
        candidate = urljoin(home_url, href)
        if normalized_host(candidate) == home_host and any(word in label for word in CONTACT_WORDS):
            yield candidate


def fetch_website_phones(url: str, timeout: int) -> tuple[list[str], str]:
    try:
        response = requests.get(url, headers=HEADERS, timeout=timeout, allow_redirects=True)
        response.raise_for_status()
        if normalized_host(response.url) != normalized_host(url):
            return [], "website redirected to another domain"
        homepage = BeautifulSoup(response.text, "html.parser")
        phones = extract_phones(homepage)
        checked = {response.url}
        for contact_url in list(dict.fromkeys(contact_page_urls(response.url, homepage)))[:2]:
            if contact_url in checked:
                continue
            checked.add(contact_url)
            try:
                contact_response = requests.get(contact_url, headers=HEADERS, timeout=timeout, allow_redirects=True)
                contact_response.raise_for_status()
                if normalized_host(contact_response.url) == normalized_host(url):
                    phones.extend(extract_phones(BeautifulSoup(contact_response.text, "html.parser")))
            except requests.RequestException:
                continue
        unique = list(dict.fromkeys(phones))
        return unique, "website contact found" if unique else "no phone on homepage/contact page"
    except requests.RequestException as error:
        return [], f"website unavailable: {error.__class__.__name__}"


def choose_website_phone(candidates: list[str], existing_phone: str | None) -> str | None:
    if not candidates:
        return None
    existing = normalize_indian_phone(existing_phone or "")
    if existing and existing in candidates:
        return existing
    # Prefer a mobile number when a company exposes both a mobile and a landline.
    return next((phone for phone in candidates if phone.startswith("+91 ")), candidates[0])


def fetch_rows(client: Any, industries: list[str], limit: int) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for industry in industries:
        result = client.table("active_leads").select(
            "id,company_name,industry,phone,phone_type,is_whatsapp,whatsapp_link,website,location,city"
        ).eq("industry", industry).limit(limit).execute()
        rows.extend(result.data or [])
    return rows


def main() -> int:
    parser = argparse.ArgumentParser(description="Verify stored lead phones against official websites.")
    parser.add_argument("--apply", action="store_true", help="Write reviewed enrichment results to Supabase.")
    parser.add_argument("--limit-per-industry", type=int, default=100, help="Maximum rows to inspect for each of the five industries.")
    parser.add_argument("--timeout", type=int, default=10, help="Website request timeout in seconds.")
    parser.add_argument("--industry", action="append", choices=ALL_INDUSTRIES, help="Run for one industry; repeat to select more.")
    args = parser.parse_args()

    load_local_env()
    url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL", "").rstrip("/")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
    if not url or not key:
        print("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.", file=sys.stderr)
        return 2

    client = create_client(url, key)
    industries = args.industry or ALL_INDUSTRIES
    rows = fetch_rows(client, industries, args.limit_per_industry)
    print(f"Inspecting {len(rows)} leads across {len(industries)} industries ({'APPLY' if args.apply else 'DRY RUN'}).")

    updates = 0
    for row in rows:
        website = row.get("website")
        existing_phone = row.get("phone")
        if not is_official_website(website):
            print(f"KEEP  | {row['company_name']} | maps fallback | no official website")
            continue

        candidates, reason = fetch_website_phones(website, args.timeout)
        website_phone = choose_website_phone(candidates, existing_phone)
        if not website_phone:
            print(f"KEEP  | {row['company_name']} | maps fallback | {reason}")
            continue

        current_normalized = normalize_indian_phone(existing_phone or "")
        changed = current_normalized != website_phone
        print(f"{'UPDATE' if changed else 'MATCH '} | {row['company_name']} | {website_phone} | {reason}")
        if not args.apply or not changed:
            continue

        digits = re.sub(r"\D", "", website_phone).removeprefix("91")
        is_mobile = len(digits) == 10 and digits[0] in "6789"
        payload = {
            "phone": website_phone,
            "phone_type": "Mobile" if is_mobile else "Landline",
            "is_whatsapp": is_mobile,
            "whatsapp_link": f"https://wa.me/91{digits}" if is_mobile else None,
            "phone_source": "official_website",
            "phone_verified_at": datetime.now(timezone.utc).isoformat(),
        }
        client.table("active_leads").update(payload).eq("id", row["id"]).execute()
        updates += 1

    print(f"Completed. {updates} rows updated." if args.apply else "Completed dry run. No database rows were changed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
