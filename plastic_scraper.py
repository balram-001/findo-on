import asyncio
import json
import os
import sys
import re
import random
from pathlib import Path
from dotenv import load_dotenv
from playwright.async_api import async_playwright
from supabase import create_client, Client

# ==========================================
# 1. ABSOLUTE .ENV LOADING & SUPABASE SETUP
# ==========================================
BASE_DIR = Path(__file__).resolve().parent
ENV_FILE = BASE_DIR / ".env"

print(f"🔍 Loading configuration from: {ENV_FILE}")

if not ENV_FILE.exists():
    print(f"❌ ERROR: `.env` file not found at {ENV_FILE}")
    print("👉 Solution: Create a file named `.env` in your project root directory.")
    sys.exit(1)

load_dotenv(dotenv_path=ENV_FILE, override=True)

SUPABASE_URL = os.getenv("NEXT_PUBLIC_SUPABASE_URL", "").strip()
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "").strip()

print(f"🔗 Loaded Supabase URL: {SUPABASE_URL if SUPABASE_URL else '❌ NOT FOUND'}")

if not SUPABASE_URL or "your-supabase-url" in SUPABASE_URL:
    raise ValueError("❌ Invalid SUPABASE_URL! Please verify the content inside your .env file.")

try:
    supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
    print("✅ Supabase Client Initialized Successfully!")
except Exception as e:
    print(f"❌ Failed to connect to Supabase: {e}")
    sys.exit(1)

# Helper: GSTIN Generator for MP (State Code 23)
def generate_gstin():
    state_code = "23"
    random_pan = "".join(random.choices("ABCDEFGHIJKLMNOPQRSTUVWXYZ", k=5)) + \
                 "".join(random.choices("0123456789", k=4)) + \
                 random.choice("ABCDEFGHIJKLMNOPQRSTUVWXYZ")
    return f"{state_code}{random_pan}1Z5"

def clean_company_name(name):
    """Company name me se extra suffix hatakar strictly compare karta hai"""
    name = name.lower()
    name = re.sub(r'\b(pvt|ltd|private|limited|co|company|indore|mfg|manufacturers|traders|dealers|moulding|molding|plastics|components|works|industry|industries)\b', '', name)
    return re.sub(r'[^a-z0-9]', '', name)


# ==========================================
# 2. STRICTLY INDORE PLASTIC SCRAPER
# ==========================================
PLASTIC_SEARCH_QUERIES = [
    "Plastic Moulding Manufacturers in Indore",
    "Plastic Moulding Components in Pithampur Indore",
    "Plastic Injection Moulding in Sanwer Road Indore",
    "Plastic Component Manufacturers in Indore",
    "Plastic Blow Moulding Factory in Indore",
    "Plastic Packaging Manufacturers in Indore",
    "Plastic Product Manufacturers in Indore",
    "Plastic Containers Manufacturers in Indore",
    "Polymer Products Manufacturers in Indore",
    "Plastic Articles Manufacturers in Palda Indore",
    "Plastic Moulding Works in Rau Indore"
]

async def scrape_plastic_leads(max_total=100):
    print(f"\n🚀 Starting Plastic Moulding Scraper for Indore (Target: {max_total} Unique Leads)\n" + "="*60)
    
    extracted_leads = []
    seen_company_keys = set()
    seen_phones = set()

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=False)
        context = await browser.new_context(viewport={'width': 1280, 'height': 800})
        page = await context.new_page()

        for query in PLASTIC_SEARCH_QUERIES:
            if len(extracted_leads) >= max_total:
                break

            print(f"\n🔍 Searching Area Keyword: '{query}'")
            maps_url = f"https://www.google.com/maps/search/{query.replace(' ', '+')}"
            await page.goto(maps_url, wait_until="domcontentloaded")
            await page.wait_for_timeout(3000)

            sidebar = page.locator('div[role="feed"]')
            
            # Deep scroll to load more Indore listings per query
            for _ in range(15):
                if await sidebar.count() > 0:
                    await sidebar.evaluate("el => el.scrollTop = el.scrollHeight")
                    await page.wait_for_timeout(1500)

            articles = await page.locator('div[role="article"]').all()

            for article in articles:
                try:
                    name_el = article.locator('div.qBF1Pd')
                    if not await name_el.count():
                        continue
                    
                    comp_name = (await name_el.inner_text()).strip()
                    clean_key = clean_company_name(comp_name)

                    # Filter 1: Cleaned Name Deduplication
                    if not clean_key or clean_key in seen_company_keys:
                        continue

                    await article.click()
                    await page.wait_for_timeout(1800)

                    # Extract Phone Number
                    phone = "N/A"
                    phone_btn = page.locator('button[data-tooltip*="phone"], button[data-item-id*="phone"]')
                    if await phone_btn.count():
                        p_text = await phone_btn.first.inner_text()
                        phone = re.sub(r'[^0-9+]', '', p_text)

                    # Filter 2: Phone Number Deduplication
                    if phone != "N/A" and phone in seen_phones:
                        continue

                    # Extract Website
                    website = ""
                    web_btn = page.locator('a[data-tooltip*="website"], a[data-item-id*="authority"]')
                    if await web_btn.count():
                        website = await web_btn.first.get_attribute('href') or ""

                    # Extract Address
                    address = "Indore, Madhya Pradesh"
                    addr_btn = page.locator('button[data-tooltip*="address"], button[data-item-id*="address"]')
                    if await addr_btn.count():
                        address = await addr_btn.first.inner_text()

                    phone_type = "Mobile" if phone.startswith("+919") or phone.startswith("+918") or phone.startswith("+917") or phone.startswith("+916") or (len(phone) == 10) else "Landline" if phone != "N/A" else "Missing"

                    lead_record = {
                        "company_name": comp_name,
                        "phone": phone,
                        "phone_type": phone_type,
                        "is_whatsapp": phone_type == "Mobile",
                        "website": website if website else None,
                        "location": address,
                        "city": "Indore",
                        "category": "Plastic Moulding & Components",
                        "industry": "Plastic & Polymer Industry",
                        "gstin": generate_gstin()
                    }

                    # Mark seen
                    seen_company_keys.add(clean_key)
                    if phone != "N/A":
                        seen_phones.add(phone)

                    extracted_leads.append(lead_record)
                    print(f"✅ [{len(extracted_leads)}/{max_total}] Plastic Lead Added: {comp_name} | Phone: {phone}")

                    if len(extracted_leads) >= max_total:
                        break

                except Exception:
                    continue

        await browser.close()

    return extracted_leads


# ==========================================
# 3. RUNNER & SUPABASE UPSERT PUSH
# ==========================================
async def main():
    # Target 100 Unique Indore Plastic Moulding Leads
    leads = await scrape_plastic_leads(max_total=100)

    print("\n" + "="*60)
    print(f"📊 Total Unique Plastic Leads Extracted for Indore: {len(leads)}")

    if leads:
        print("⏳ Pushing Plastic Moulding Data directly into Supabase 'active_leads'...")
        try:
            res = supabase.table("active_leads").upsert(
                leads, 
                on_conflict="company_name, city, phone"
            ).execute()
            
            print(f"🎉 SUCCESS! All {len(leads)} Plastic Moulding leads saved in Supabase!")
        except Exception as err:
            print(f"❌ Supabase Error: {err}")
    else:
        print("❌ No leads extracted.")

if __name__ == "__main__":
    asyncio.run(main())