import json
import os
import socket
import sys
from typing import Any, Dict, List
from urllib.parse import urlparse

from dotenv import load_dotenv

load_dotenv(".env.local")

try:
    from supabase import Client, create_client
    SUPABASE_AVAILABLE = True
except ImportError:
    SUPABASE_AVAILABLE = False

SUPABASE_URL = os.environ.get("NEXT_PUBLIC_SUPABASE_URL", "").rstrip("/")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")


def validate_supabase_url(url: str) -> str | None:
    """Return a clear configuration error before attempting an upload."""
    parsed = urlparse(url)
    if parsed.scheme != "https" or not parsed.hostname:
        return "NEXT_PUBLIC_SUPABASE_URL must be a full HTTPS URL from Supabase."

    if not parsed.hostname.endswith(".supabase.co"):
        return "NEXT_PUBLIC_SUPABASE_URL must use your <project-ref>.supabase.co hostname."

    try:
        socket.getaddrinfo(parsed.hostname, 443, type=socket.SOCK_STREAM)
    except socket.gaierror:
        return (
            f"Supabase hostname does not resolve: {parsed.hostname}. "
            "Copy the Project URL again from Supabase Dashboard > Settings > API "
            "and update .env.local."
        )
    return None


def sync_json_file_to_supabase(json_filepath: str, city: str = "Mumbai", industry: str = "Packaging"):
    if not os.path.exists(json_filepath):
        print(f"❌ File not found: {json_filepath}")
        return

    if not SUPABASE_AVAILABLE or not SUPABASE_URL or not SUPABASE_KEY:
        print("❌ Supabase credentials missing or client not installed.")
        return

    url_error = validate_supabase_url(SUPABASE_URL)
    if url_error:
        print(f"❌ Supabase configuration error: {url_error}")
        return

    with open(json_filepath, "r", encoding="utf-8") as f:
        data: List[Dict[str, Any]] = json.load(f)

    clean_batch = []
    for item in data:
        company_name = item.get("companyName")
        if not company_name:
            continue
        clean_batch.append({
            "company_name": company_name,
            "category": item.get("category") or industry,
            "industry": industry,
            "city": city,
            "phone": item.get("phone") or "",
            "phone_type": item.get("phoneType") or "Missing",
            "is_whatsapp": bool(item.get("isWhatsapp")),
            "website": item.get("website") or None,
            "gstin": item.get("gstin") or None,
            "whatsapp_link": item.get("whatsappLink") or None,
            "location": item.get("location") or city,
        })

    if not clean_batch:
        print("⚠️ No valid rows in JSON.")
        return

    print(f"📡 Uploading {len(clean_batch)} leads to Supabase 'active_leads'...")
    
    try:
        supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
        supabase.table("active_leads").upsert(
            clean_batch,
            on_conflict="company_name,city,phone"
        ).execute()
        print(f"🎉 SUCCESS! {len(clean_batch)} leads uploaded to Supabase!")
    except Exception as err:
        print(f"🛑 Upload failed: {err}")


if __name__ == "__main__":
    file_path = sys.argv[1] if len(sys.argv) > 1 else "scraped_output.json"
    sync_json_file_to_supabase(file_path)
