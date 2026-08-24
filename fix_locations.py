import os
import re
import time
from playwright.sync_api import sync_playwright
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv(".env.local")

SUPABASE_URL = os.getenv("NEXT_PUBLIC_SUPABASE_URL", "").strip()
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "").strip()

if not SUPABASE_URL or not SUPABASE_KEY:
    SUPABASE_URL = "https://mdblmxeqkkctiqaxomzp.supabase.co"
    SUPABASE_KEY = "AAPKI_EXACT_SERVICE_ROLE_KEY"

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

def clean_extracted_address(raw_text: str) -> str:
    cleaned = re.sub(r"(Directions|Save|Nearby|Send to phone|Share|Closed|Open|Hours|Reviews|Rating|N/A|\.\.\.)", "", raw_text)
    cleaned = re.sub(r"^[^a-zA-Z0-9]+", "", cleaned) # Corrupt icons clean
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    return cleaned

def run_live_maps_verifier():
    print("Fetching leads from Supabase with Pagination...")
    all_leads = []
    page_size = 1000
    start = 0

    while True:
        res = supabase.table("active_leads").select("id, company_name, location, city").range(start, start + page_size - 1).execute()
        data = res.data or []
        if not data:
            break
        all_leads.extend(data)
        if len(data) < page_size:
            break
        start += page_size

    total = len(all_leads)
    print(f"Total leads loaded: {total}")
    print("Launching visible Chrome Browser...")

    with sync_playwright() as p:
        # headless=False se browser aapke samne live khulega
        browser = p.chromium.launch(headless=False, slow_mo=50)
        context = browser.new_context(viewport={"width": 1280, "height": 800})
        page = context.new_page()

        for idx, lead in enumerate(all_leads, 1):
            comp_name = (lead.get("company_name") or "").strip()
            if not comp_name or comp_name.lower() in ["results", "n/a"]:
                continue

            query = f"{comp_name} Indore Pithampur Dewas"
            maps_url = f"https://www.google.com/maps/search/{requests_quote(query)}"

            print(f"\n[{idx}/{total}] Searching: {comp_name}")
            
            try:
                page.goto(maps_url, timeout=20000)
                page.wait_for_timeout(1500)

                # Google Maps ka direct address button selector
                address_element = page.locator('button[data-item-id="address"]').first
                
                exact_address = ""
                if address_element.is_visible(timeout=3000):
                    raw_text = address_element.inner_text()
                    exact_address = clean_extracted_address(raw_text)
                
                # Agar direct business panel nahi mila aur search list aayi
                if not exact_address:
                    first_result = page.locator('div[role="feed"] > div').first
                    if first_result.is_visible():
                        first_result.click()
                        page.wait_for_timeout(1500)
                        if address_element.is_visible(timeout=2500):
                            exact_address = clean_extracted_address(address_element.inner_text())

                # City determination from verified address
                city = "Indore"
                addr_lower = (exact_address + " " + comp_name).lower()
                if "pithampur" in addr_lower or "dhar" in addr_lower or "sez" in addr_lower:
                    city = "Pithampur"
                elif "dewas" in addr_lower or "itawa" in addr_lower:
                    city = "Dewas"
                elif "ujjain" in addr_lower:
                    city = "Ujjain"
                else:
                    city = "Indore"

                if not exact_address:
                    exact_address = f"{city}, Madhya Pradesh"

                # Update in Supabase
                try:
                    supabase.table("active_leads").update({
                        "city": city,
                        "location": exact_address
                    }).eq("id", lead["id"]).execute()
                    print(f" -> 📍 Found: [{city}] {exact_address}")
                except Exception as e:
                    if "23505" in str(e):
                        supabase.table("active_leads").delete().eq("id", lead["id"]).execute()

            except Exception as err:
                print(f" -> Skipped due to timeout: {err}")

        browser.close()

def requests_quote(text: str) -> str:
    import urllib.parse
    return urllib.parse.quote_plus(text)

if __name__ == "__main__":
    run_live_maps_verifier()