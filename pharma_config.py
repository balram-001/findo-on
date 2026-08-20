import asyncio
import os
import re
import sys
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
# 2. PURE PHARMA TARGETED QUERIES
# ==========================================
INDUSTRY = "Pharmaceuticals & Healthcare Manufacturing"
TARGET_NEW_LEADS = 50

PURE_PHARMA_QUERIES = [
    {"query": "Pharma Third Party Manufacturer Indore", "category": "CDMO & Third Party"},
    {"query": "Pharma CDMO plant Pithampur", "category": "CDMO & Third Party"},
    {"query": "Tablet Capsule Manufacturers Palda Indore", "category": "Formulations"},
    {"query": "Injectable Ointment Factory Rau Pigdamber Indore", "category": "Formulations"},
    {"query": "Pharma Formulations Plant Polo Ground Indore", "category": "Formulations"},
    {"query": "Ayurvedic Medicine Factory Palda Industrial Area Indore", "category": "Nutraceuticals & Herbal"},
    {"query": "Herbal Extracts Manufacturer Laxmibai Nagar Indore", "category": "Nutraceuticals & Herbal"},
    {"query": "Pharma HDPE Bottle Packaging Factory Pithampur", "category": "Pharma Packaging"},
    {"query": "Pharma Aluminum Foil Packaging Manufacturer Indore", "category": "Pharma Packaging"},
    {"query": "Bulk Drug Intermediates Plant Dewas", "category": "API & Bulk Drugs"}
]

STRICT_RETAIL_REJECTS = [
    "medical store", "chemist shop", "hospital", "clinic", "pathology lab", 
    "diagnostic center", "ayurvedic medical store", "retail store", "dawa bazar"
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

def is_b2c_retail(name: str, text: str = "") -> bool:
    combined = f"{name} {text}".lower()
    return any(neg in combined for neg in STRICT_RETAIL_REJECTS)

def fetch_db_cache():
    try:
        res = supabase.table("active_leads").select("company_name,phone").execute()
        existing = res.data or []
        names = {normalize_name(item.get("company_name")) for item in existing if item.get("company_name")}
        phones = {re.sub(r"\D", "", str(item.get("phone"))) for item in existing if item.get("phone") and item.get("phone") != "N/A"}
        return names, phones
    except Exception as e:
        print(f"⚠️ Cache Load Warning: {e}")
        return set(), set()

# ==========================================
# 3. SCRAPING ENGINE
# ==========================================
async def scrape_pharma_only():
    existing_names, existing_phones = fetch_db_cache()
    print(f"📦 DB Cache: {len(existing_names)} Companies | {len(existing_phones)} Phones\n")

    inserted_count = 0

    async with async_playwright() as p:
        browser = await p.chromium.launch(
            headless=False,
            args=["--disable-blink-features=AutomationControlled", "--no-sandbox"]
        )
        context = await browser.new_context(
            viewport={'width': 1366, 'height': 768},
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
        )
        page = await context.new_page()

        for q_obj in PURE_PHARMA_QUERIES:
            if inserted_count >= TARGET_NEW_LEADS:
                break

            query = q_obj["query"]
            category = q_obj["category"]
            print(f"🔎 [SEARCHING PHARMA] '{query}'")

            try:
                url = f"https://www.google.com/maps/search/{quote(query)}"
                await page.goto(url, wait_until="domcontentloaded", timeout=25000)
                await page.wait_for_selector('div[role="feed"]', timeout=15000)
            except Exception:
                print("   ⏩ Query load timeout, skipping...\n")
                continue

            feed = page.locator('div[role="feed"]')
            for _ in range(15):
                await feed.evaluate("el => el.scrollBy(0, 2000)")
                await asyncio.sleep(0.5)

            cards = await page.locator('div[role="article"]').all()
            print(f"   Found {len(cards)} potential listings.")

            for card in cards:
                if inserted_count >= TARGET_NEW_LEADS:
                    break

                try:
                    name_el = card.locator('div.qBF1Pd, a.hfT39').first
                    comp_name = (await name_el.inner_text()).strip() if await name_el.count() else await card.get_attribute("aria-label") or ""
                    clean_key = normalize_name(comp_name)

                    if not clean_key or clean_key in existing_names:
                        continue

                    await card.click()
                    await asyncio.sleep(1.0)

                    try:
                        await page.wait_for_selector('div[role="main"]', timeout=3000)
                    except Exception:
                        pass

                    panel = page.locator('div[role="main"]').first
                    panel_text = await panel.inner_text() if await panel.count() else ""

                    if is_b2c_retail(comp_name, panel_text):
                        print(f"   ❌ [SKIP B2C RETAIL] {comp_name}")
                        continue

                    # Extract Phone
                    raw_phone = "N/A"
                    phone_btn = page.locator('button[data-tooltip*="phone"], button[data-item-id*="phone:"], a[href^="tel:"]').first
                    if await phone_btn.count():
                        raw_phone = await phone_btn.inner_text() or await phone_btn.get_attribute("href") or ""
                        raw_phone = re.sub(r'[^0-9+]', '', raw_phone)

                    if raw_phone == "N/A" or len(re.sub(r'\D', '', raw_phone)) < 8:
                        match = re.search(r'(?:\+91[\s-]?)?[6-9]\d{9}|(?:0\d{2,4}[\s-]?)?\d{6,8}', panel_text)
                        if match:
                            raw_phone = match.group(0).strip()

                    # Website
                    website = None
                    web_btn = page.locator('a[data-tooltip*="website"], a[data-item-id*="authority"]').first
                    if await web_btn.count():
                        website = await web_btn.get_attribute('href')

                    # Website Crawl Fallback if Phone Missing
                    if (raw_phone == "N/A" or len(re.sub(r'\D', '', raw_phone)) < 8) and website:
                        site_tab = await context.new_page()
                        try:
                            await site_tab.goto(website, wait_until="domcontentloaded", timeout=4500)
                            site_text = (await site_tab.locator("body").inner_text())[:15000]
                            w_match = re.search(r'(?:\+91[\s-]?)?[6-9]\d{9}|(?:0\d{2,4}[\s-]?)?\d{6,8}', site_text)
                            if w_match:
                                raw_phone = w_match.group(0).strip()
                        except Exception:
                            pass
                        finally:
                            await site_tab.close()

                    formatted_phone, phone_type, is_wa, wa_link = classify_phone(raw_phone)
                    if formatted_phone == "N/A":
                        print(f"   ❌ [NO PHONE] {comp_name}")
                        continue

                    phone_digits = re.sub(r"\D", "", formatted_phone)
                    if phone_digits in existing_phones:
                        print(f"   ⏩ [SKIP DUPLICATE PHONE] {comp_name}")
                        continue

                    address = "Indore / Pithampur Pharma Belt"
                    addr_btn = page.locator('button[data-item-id="address"]').first
                    if await addr_btn.count():
                        address = (await addr_btn.inner_text()).replace('\n', ', ')

                    city = "Pithampur" if "pithampur" in (comp_name + address + query).lower() else ("Dewas" if "dewas" in (comp_name + address + query).lower() else "Indore")

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
                    print(f"🚀 [PHARMA STORED #{inserted_count}] {comp_name}")
                    print(f"📞 Contact : {formatted_phone} ({phone_type})")
                    print(f"💬 WhatsApp: {'Yes (' + wa_link + ')' if is_wa else 'No'}")
                    print(f"🌐 Website : {website or 'N/A'}")
                    print(f"📍 City    : {city}")
                    print("=" * 60 + "\n")

                except Exception:
                    continue

        await browser.close()

    print(f"\n🎉 Done! Total {inserted_count} pure pharma leads saved.")

if __name__ == "__main__":
    asyncio.run(scrape_pharma_only())