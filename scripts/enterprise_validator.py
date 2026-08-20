"""
Enterprise 3-Tier Lead Validation & Supabase Ingestion Script

Tiers Included:
1. Micro-Grid Query Generation (Input Level)
2. Website Content-Density Analysis (Processing Level)
3. Strict Primary Category Ingestion Filter (Database Level)
"""

import os
import re
import sys
from typing import Any, Dict, List, Tuple
import requests
from bs4 import BeautifulSoup

try:
    from supabase import create_client, Client
    SUPABASE_AVAILABLE = True
except ImportError:
    SUPABASE_AVAILABLE = False

# ---------------------------------------------------------------------------
# CONFIGURATION & KEYWORD RULES
# ---------------------------------------------------------------------------

SUPABASE_URL = os.environ.get("NEXT_PUBLIC_SUPABASE_URL", "").rstrip("/")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")

# Strict Domain Rules (Customize per Industry)
TARGET_NICHE = "packaging"

ALLOWED_KEYWORDS = [
    "packaging", "box", "carton", "pouch", "container", 
    "corrugated", "label", "printing", "plastic", "rigid", "flexible"
]

REJECTED_KEYWORDS = [
    "steel", "chemical", "software", "pharmacy", "furniture", 
    "scrap", "repair", "garage", "textile", "real estate"
]

STRICT_BLOCKED_CATEGORIES = {
    "repair shop", "garage", "service center", "used auto parts",
    "software company", "school", "college", "bank", "atm", "real estate agency"
}


# ---------------------------------------------------------------------------
# TIER 1: QUERY OPTIMIZATION (Input Level)
# ---------------------------------------------------------------------------

def generate_micro_grid_queries(industry: str, locations_or_pincodes: List[str]) -> List[str]:
    """
    Wraps keywords in strict double-quotes and splits large cities into micro-locations/pincodes.
    Example: '"packaging" manufacturer in 400001'
    """
    clean_industry = industry.strip().lower()
    queries = []
    for loc in locations_or_pincodes:
        # Strict quotes force Google Maps to avoid domain expansion
        query = f'"{clean_industry}" manufacturer in {loc.strip()}'
        queries.append(query)
    return queries


# ---------------------------------------------------------------------------
# TIER 2: WEBSITE CONTENT-DENSITY CHECK (Processing Level)
# ---------------------------------------------------------------------------

def analyze_website_density(
    url: str | None, 
    allowed_keywords: List[str], 
    rejected_keywords: List[str],
    timeout: int = 5
) -> Tuple[bool, str]:
    """
    Crawls the company homepage and verifies keyword density.
    Returns (is_valid, reason).
    """
    if not url or not url.startswith(("http://", "https://")):
        # If site is missing, mark for category-only check
        return True, "No website URL available; bypassing density check"

    try:
        response = requests.get(
            url, 
            timeout=timeout, 
            headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124.0.0.0"}
        )
        if response.status_code >= 400:
            return False, f"Website returned HTTP {response.status_code}"

        soup = BeautifulSoup(response.text, "html.parser")
        
        # Remove script, style, and navigation noise
        for element in soup(["script", "style", "nav", "footer"]):
            element.extract()

        text = soup.get_text(separator=" ").lower()
        words = re.findall(r"\b[a-z]{3,}\b", text)

        allowed_count = sum(words.count(kw.lower()) for kw in allowed_keywords)
        rejected_count = sum(words.count(kw.lower()) for kw in rejected_keywords)

        # Rejection Logic
        if rejected_count > allowed_count:
            return False, f"Irrelevant niche detected ({rejected_count} rejected vs {allowed_count} allowed keywords)"

        if allowed_count == 0:
            return False, "Zero density of allowed target keywords on homepage"

        return True, f"Density verified ({allowed_count} target keyword matches)"

    except Exception as error:
        return False, f"Crawl failed: {str(error)}"


# ---------------------------------------------------------------------------
# TIER 3: SUPABASE INGESTION FILTER (Database Level)
# ---------------------------------------------------------------------------

def is_category_strictly_valid(primary_category: str, target_niche: str) -> bool:
    """
    Checks if the primary category strictly belongs to the target niche before DB insertion.
    """
    if not primary_category:
        return False

    cat = primary_category.lower().strip()

    # Block non-commercial or generic retail stores
    if any(blocked in cat for blocked in STRICT_BLOCKED_CATEGORIES):
        return False

    # Target niche or allowed keywords match
    if target_niche.lower() in cat or any(kw in cat for kw in ALLOWED_KEYWORDS):
        return True

    return False


def validate_and_ingest_leads(raw_scraped_leads: List[Dict[str, Any]], target_niche: str = TARGET_NICHE) -> Dict[str, int]:
    """
    Filters raw lead dictionaries using the 3-Tier Pipeline and upserts valid ones to Supabase.
    """
    if not SUPABASE_AVAILABLE or not SUPABASE_URL or not SUPABASE_KEY:
        print("Error: Supabase environment variables or python-supabase client missing.", file=sys.stderr)
        return {"processed": len(raw_scraped_leads), "inserted": 0, "rejected": len(raw_scraped_leads)}

    supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
    valid_leads: List[Dict[str, Any]] = []
    rejected_count = 0

    print(f"\n--- Starting 3-Tier Validation for {len(raw_scraped_leads)} leads ---")

    for lead in raw_scraped_leads:
        company_name = str(lead.get("companyName") or lead.get("company_name") or "").strip()
        primary_category = str(lead.get("category") or "").strip()
        website = str(lead.get("website") or "").strip()
        city = str(lead.get("location") or lead.get("city") or "General").strip()
        phone = str(lead.get("phone") or "").strip()

        # Tier 3 Check: Primary Category Verification
        if not is_category_strictly_valid(primary_category, target_niche):
            print(f"❌ [Dropped - Bad Category] {company_name} | Category: '{primary_category}'")
            rejected_count += 1
            continue

        # Tier 2 Check: Website Content Density Verification
        is_density_valid, reason = analyze_website_density(
            url=website, 
            allowed_keywords=ALLOWED_KEYWORDS, 
            rejected_keywords=REJECTED_KEYWORDS
        )

        if not is_density_valid:
            print(f"❌ [Dropped - Content Density] {company_name} | Reason: {reason}")
            rejected_count += 1
            continue

        print(f"✅ [Passed Pipeline] {company_name} | {primary_category}")

        # Format Clean Payload for Database Ingestion
        valid_leads.append({
            "company_name": company_name,
            "category": primary_category,
            "industry": target_niche,
            "city": city,
            "phone": phone,
            "phone_type": lead.get("phoneType") or lead.get("phone_type") or "Missing",
            "is_whatsapp": bool(lead.get("isWhatsapp") or lead.get("is_whatsapp")),
            "website": website or None,
            "gstin": lead.get("gstin") or None,
            "whatsapp_link": lead.get("whatsappLink") or lead.get("whatsapp_link") or None,
            "location": lead.get("location") or city,
        })

    # DB Ingestion via Upsert
    inserted_count = 0
    if valid_leads:
        try:
            response = supabase.table("leads").upsert(
                valid_leads, 
                on_conflict="company_name,city,phone"
            ).execute()
            
            inserted_count = len(response.data) if response.data else 0
            print(f"\n🎉 Ingestion Complete: {inserted_count} clean leads saved to Supabase.")
        except Exception as e:
            print(f"\n🛑 Supabase Ingestion Error: {e}", file=sys.stderr)

    return {
        "processed": len(raw_scraped_leads),
        "inserted": inserted_count,
        "rejected": rejected_count
    }


# ---------------------------------------------------------------------------
# SCRIPT EXECUTION TEST
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    # Test Payload
    test_raw_leads = [
        {
            "companyName": "Apex Packaging Industries",
            "category": "Packaging Supply Store",
            "website": "https://example.com",
            "location": "Mumbai",
            "phone": "9876543210"
        },
        {
            "companyName": "General Steel Fabrication",
            "category": "Steel Manufacturer",
            "website": "https://example-steel.com",
            "location": "Mumbai",
            "phone": "9876543211"
        }
    ]

    results = validate_and_ingest_leads(test_raw_leads)
    print("\nValidation Summary:", results)