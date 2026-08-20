import asyncio
import os
import re
import sys
import random
from pathlib import Path
from urllib.parse import quote
from dotenv import load_dotenv
from playwright.async_api import async_playwright
from supabase import create_client, Client

# ==========================================
# 1. ENVIRONMENT & SUPABASE SETUP
# ==========================================
BASE_DIR = Path(__file__).resolve().parent
ENV_FILE = BASE_DIR / ".env.local" if (BASE_DIR / ".env.local").exists() else BASE_DIR / ".env"

if not ENV_FILE.exists():
    print("❌ Error: `.env.local` ya `.env` file nahi mili!")
    sys.exit(1)

load_dotenv(dotenv_path=ENV_FILE, override=True)

SUPABASE_URL = (os.getenv("NEXT_PUBLIC_SUPABASE_URL") or os.getenv("SUPABASE_URL") or "").strip()
SUPABASE_KEY = (os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("SUPABASE_KEY") or "").strip()

if not SUPABASE_URL or not SUPABASE_KEY:
    print("❌ Error: Supabase Credentials missing hain!")
    sys.exit(1)

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

# ==========================================
# 2. PHARMA QUERIES & CONFIG
# ==========================================
INDUSTRY = "Pharmaceuticals & Healthcare Manufacturing"
TARGET_NEW_LEADS = 50

PHARMA_QUERIES = [
    {"query": "Pharma Manufacturers in Pithampur", "category": "Formulations"},
    {"query": "Pharma Company Sanwer Road Indore", "category": "Formulations"},
    {"query": "API Bulk Drug Manufacturers Indore", "category": "API & Bulk Drugs"},
    {"query": "Ayurvedic Medicine Factory Indore", "category": "Nutraceuticals & Herbal"},
    {"query": "Pharma Packaging Material Factory Pithampur", "category": "Pharma Packaging"},
    {"query": "Injectable Manufacturers Pithampur Industrial Area", "category": "Formulations"},
    {"query": "Nutraceutical Manufacturers Palda Indore", "category": "Nutraceuticals & Herbal"},
    {"query": "Pharmaceutical Factory Rau Indore", "category": "Formulations"},
    {"query": "Bulk Drug Manufacturers Dewas", "category": "API & Bulk Drugs"}
]

HARD_NEGATIVES = [
    "medical store", "pharmacy shop", "chemist shop", "hospital", "clinic",
    "retailer", "wholesaler", "pathology", "diagnostic", "central lab"
]

MFG_TERMS = [
    "manufacturer", "manufacturing", "pharma", "pharmaceuticals", "laboratories",
    "labs", "formulations", "api", "bulk drug", "remedies", "pvt ltd", "ltd", "herbal", "ayurvedic"
]

def normalize_name(name: str) -> str:
    clean = (name or "").lower()
    clean = re.sub(r'\b(pvt|ltd|private|limited|co|company|indore|pithampur|dewas)\b', '', clean)
    return re.sub(r'[^a-z0-9]', '', clean).strip()

def classify_phone(raw_phone: str):
    if not raw_phone or raw_phone == "N/A":
        return "N/A", "Missing", False, None
    digits = re.sub(r"\D", "", str(raw_phone))
    if not digits:
        return "N/A", "Missing", False, None
    core = digits[2:] if digits.startswith("91") and len(digits) > 10 else digits
    core = core.lstrip("0")
    if len(core) == 10 and core[0] in "6789":
        return f"+91{core}", "Mobile", True, f"https://wa.me/91{core}"
    return (digits if digits.startswith("0") else f"0{core}"), "Landline", False, None

def is_valid_pharma_mfg(name: str, page_text: str = "") -> bool:
    text = f"{name} {page_text}".lower()
    if any(neg in text for neg in HARD_NEGATIVES):
        return False
    return any(mfg in text for mfg in MFG_TERMS)

def fetch_existing_cache():
    try:
        res = supabase.table("active_leads").select("company_name,phone").execute()
        existing = res.data or []
        names = {normalize_name(item.get("company_name")) for item in existing if item.get("company_name")}
        phones = {re.sub(r"\D", "", str(item.get("phone"))) for item in existing if item.get("phone") and item.get("phone") != "N/A"}
        return names, phones
    except Exception:
        return set(), set()

# ==========================================
# 3. SCRAPING ENGINE (WITH SIDE PANEL WAIT)
# ==========================================
async def scrape_pharma_leads():
    existing_names, existing_phones = fetch_existing_cache()
    print(f"📦 Cached Records: {len(existing_names)} Companies | {len(existing_phones)} Phones\n")
    
    inserted_count = 0

    async with async_playwright() as p:
        browser = await p.chromium.launch(
            headless=True,
            args=["--disable-blink-features=AutomationControlled", "--no-sandbox"]
        )
        context = await browser.new_context(
            viewport={'width': 1366, 'height': 768},
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
        )
        
        page = await context.new_page()

        for q_data in PHARMA_QUERIES:
            if inserted_count >= TARGET_NEW_LEADS:
                break

            query = q_data["query"]
            category = q_data["category"]
            print(f"🔎 [SEARCHING] '{query}'")

            try:
                url = f"https://www.google.com/maps/search/{quote(query)}"
                await page.goto(url, wait_until="domcontentloaded", timeout=20000)
                await page.wait_for_selector('div[role="feed"], div[role="article"]', timeout=12000)
            except Exception:
                print("   ⏩ Timeout on query, moving to next...\n")
                continue

            feed = page.locator('div[role="feed"]')
            if await feed.count() > 0:
                for _ in range(8):
                    await feed.evaluate("el => el.scrollBy(0, 1000)")
                    await asyncio.sleep(0.8)

            cards = await page.locator('div[role="article"]').all()

            for card in cards:
                if inserted_count >= TARGET_NEW_LEADS:
                    break

                try:
                    # Company Name Extraction
                    comp_name = ""
                    if await card.locator('div.qBF1Pd').count() > 0:
                        comp_name = (await card.locator('div.qBF1Pd').first.inner_text()).strip()
                    else:
                        comp_name = (await card.get_attribute("aria-label")) or ""

                    clean_key = normalize_name(comp_name)
                    if not clean_key or clean_key in existing_names:
                        continue

                    # Click and Wait specifically for Side Panel DOM
                    await card.click()
                    
                    try:
                        await page.wait_for_selector('div[role="main"]', timeout=4000)
                    except Exception:
                        await asyncio.sleep(1.5)

                    # Phone Extraction System
                    maps_phone = "N/A"
                    
                    # 1. Direct Phone Buttons Selector Sweep
                    phone_btn = page.locator('button[data-tooltip*="phone"], button[data-item-id*="phone"], a[data-item-id*="phone"], button[aria-label*="Phone"], button[aria-label*="Call"]').first
                    if await phone_btn.count():
                        btn_attr = await phone_btn.get_attribute("data-item-id") or await phone_btn.get_attribute("href") or ""
                        btn_text = await phone_btn.inner_text() or ""
                        maps_phone = re.sub(r'[^0-9+]', '', btn_attr or btn_text)

                    # 2. Side Panel Full Text Regex Sweep (Fallback)
                    if maps_phone == "N/A" or len(re.sub(r'\D', '', maps_phone)) < 8:
                        try:
                            panel = page.locator('div[role="main"]').first
                            if await panel.count():
                                panel_text = await panel.inner_text()
                                matches = re.findall(r"(?:\+91[\s\-]?)?[6-9]\d{9}|(?:0\d{2,4}[\s\-]?)?\d{6,8}", panel_text)
                                if matches:
                                    # Pick the longest valid number match
                                    for m in matches:
                                        clean_m = re.sub(r'\D', '', m)
                                        if len(clean_m) >= 8:
                                            maps_phone = m.strip()
                                            break
                        except Exception:
                            pass

                    # Website Extraction
                    website = None
                    web_btn = page.locator('a[data-tooltip*="website"], a[data-item-id*="authority"]').first
                    if await web_btn.count():
                        website = await web_btn.get_attribute('href')

                    formatted_phone, phone_type, is_wa, wa_link = classify_phone(maps_phone)
                    if formatted_phone == "N/A":
                        print(f"   ❌ [NO PHONE] {comp_name}")
                        continue

                    phone_digits = re.sub(r"\D", "", formatted_phone)
                    if phone_digits in existing_phones:
                        print(f"   ⏩ [SKIP DUPLICATE PHONE] {comp_name}")
                        continue

                    # B2B Validation Check
                    maps_text = (await page.locator("body").inner_text())[:8000]
                    if not is_valid_pharma_mfg(comp_name, maps_text):
                        print(f"   ❌ [REJECTED B2C] {comp_name}")
                        continue

                    # Address & Location
                    address = "Indore / Pithampur Hub"
                    addr_btn = page.locator('button[data-item-id="address"]').first
                    if await addr_btn.count():
                        address = (await addr_btn.inner_text()).replace('\n', ', ')

                    city = "Pithampur" if "pithampur" in (comp_name + address + query).lower() else "Indore"

                    # Database Insert
                    lead_data = {
                        "company_name": comp_name,
                        "phone": formatted_phone,
                        "phone_type": phone_type,
                        "is_whatsapp": is_wa,
                        "whatsapp_link": wa_link,
                        "website": website,
                        "location": address,
                        "city": city,
                        "category": category,
                        "industry": INDUSTRY
                    }

                    supabase.table("active_leads").insert(lead_data).execute()

                    existing_names.add(clean_key)
                    existing_phones.add(phone_digits)
                    inserted_count += 1

                    print("\n" + "=" * 60)
                    print(f"🚀 [STORED #{inserted_count}] {comp_name}")
                    print(f"📞 Contact : {formatted_phone} | {phone_type}")
                    print(f"💬 WhatsApp: {wa_link or 'No'}")
                    print(f"📍 Location: {city}")
                    print("=" * 60 + "\n")

                except Exception:
                    continue

        await browser.close()

    print(f"\n🎉 Process Finished! Total {inserted_count} new leads saved.")

if __name__ == "__main__":
    asyncio.run(scrape_pharma_leads())