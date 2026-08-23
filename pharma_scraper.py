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
# 1. SETUP & DB CACHE
# ==========================================
BASE_DIR = Path(__file__).resolve().parent
ENV_FILE = BASE_DIR / ".env.local" if (BASE_DIR / ".env.local").exists() else BASE_DIR / ".env"

if not ENV_FILE.exists():
    print("❌ Error: `.env.local` ya `.env` file nahi mili!")
    sys.exit(1)

load_dotenv(dotenv_path=ENV_FILE, override=True)

SUPABASE_URL = (os.getenv("NEXT_PUBLIC_SUPABASE_URL") or os.getenv("SUPABASE_URL") or "").strip()
SUPABASE_KEY = (os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("SUPABASE_KEY") or "").strip()

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

INDUSTRY = "Pharmaceuticals & Healthcare Manufacturing"
TARGET_NEW_LEADS = 50

# Targeted B2B Manufacturing Micro-Queries
COMBINED_QUERIES = [
    {"query": "Pharma manufacturing plant Pithampur Special Economic Zone", "category": "Pharma Manufacturing"},
    {"query": "Pharmaceutical formulations factory Sanwer Road Indore", "category": "Pharma Formulations"},
    {"query": "API active pharmaceutical ingredients manufacturer Pithampur", "category": "API Manufacturing"},
    {"query": "Medicine manufacturing unit Dewas Industrial Area", "category": "Pharma Manufacturing"},
    {"query": "Ayurvedic medicine manufacturing plant Indore", "category": "Ayurveda & Herbal Manufacturing"},
    {"query": "Injectable pharma plant Pithampur Sector 3", "category": "Pharma Formulations"},
    {"query": "Nutraceuticals manufacturing factory Sanwer Road Indore", "category": "Nutraceuticals"},
    {"query": "Surgical equipment manufacturers Pithampur", "category": "Medical Equipment Manufacturing"},
    {"query": "Pharma packaging material factory Sanwer Road Indore", "category": "Pharma Packaging"},
    {"query": "Herbal extracts manufacturer Dewas Road Indore", "category": "Ayurveda & Herbal Manufacturing"},
    {"query": "Capsule and tablet manufacturer Pithampur Sector 1", "category": "Pharma Formulations"},
    {"query": "Medical devices manufacturing plant Rau Indore", "category": "Medical Equipment Manufacturing"},
    {"query": "Pharma raw material supplier Palda Indore", "category": "API Manufacturing"},
    {"query": "Ointment and syrup manufacturing plant Sanwer Road Indore", "category": "Pharma Formulations"},
    {"query": "Diagnostic kit manufacturer Pithampur", "category": "Medical Equipment Manufacturing"}
]

# Strict Rejects (Filter out B2C chemist shops, hospitals, clinics)
STRICT_REJECTS = [
    "chemist shop", "medical store", "pharmacy store", "hospital", "clinic", 
    "pathology", "diagnostic center", "dawa bazar", "doctor", "nursing home", 
    "retail store", "grocery", "coaching", "tuition"
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
    
    formatted = digits if digits.startswith("0") else f"0{core}"
    return formatted, "Landline", False, None

def is_unwanted_entity(name: str, text: str = "") -> bool:
    combined = f"{name} {text}".lower()
    return any(term in combined for term in STRICT_REJECTS)

def fetch_existing_cache():
    try:
        res = supabase.table("active_leads").select("company_name,phone").execute()
        existing = res.data or []
        names = {normalize_name(item.get("company_name")) for item in existing if item.get("company_name")}
        phones = {re.sub(r"\D", "", str(item.get("phone"))) for item in existing if item.get("phone") and item.get("phone") != "N/A"}
        return names, phones
    except Exception as e:
        print(f"⚠️ Cache Load Exception: {e}")
        return set(), set()

# Helper 1: Google Search for missing website
async def search_website_on_google(context, comp_name: str) -> str:
    search_tab = await context.new_page()
    website_url = None
    try:
        query = f"{comp_name} official website Indore"
        await search_tab.goto(f"https://www.google.com/search?q={quote(query)}", wait_until="domcontentloaded", timeout=10000)
        
        links = await search_tab.locator('div.g a[href^="http"]').all()
        for link in links:
            href = await link.get_attribute("href")
            if href and not any(ignored in href for ignored in ["google.com", "facebook.com", "instagram.com", "indiamart.com", "justdial.com"]):
                website_url = href
                break
    except Exception:
        pass
    finally:
        await search_tab.close()
    return website_url

# Helper 2: Extract phone from official website
async def scrape_phone_from_website(context, website_url: str) -> str:
    if not website_url:
        return "N/A"
    
    site_tab = await context.new_page()
    found_phone = "N/A"
    try:
        await site_tab.goto(website_url, wait_until="domcontentloaded", timeout=8000)
        site_text = (await site_tab.locator("body").inner_text())[:15000]
        match = re.search(r'(?:\+91[\s-]?)?[6-9]\d{9}|0\d{2,4}[\s-]?\d{6,8}', site_text)
        if match:
            found_phone = match.group(0).strip()
    except Exception:
        pass
    finally:
        await site_tab.close()
    return found_phone

# ==========================================
# 2. SCRAPING ENGINE (Website Priority)
# ==========================================
async def scrape_all_leads():
    existing_names, existing_phones = fetch_existing_cache()
    print(f"📦 Cached Existing Records: {len(existing_names)} Companies | {len(existing_phones)} Phones\n")
    
    inserted_leads_count = 0

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

        for q_data in COMBINED_QUERIES:
            if inserted_leads_count >= TARGET_NEW_LEADS:
                break

            query = q_data["query"]
            category = q_data["category"]
            print(f"🔎 [SEARCHING] '{query}'")

            try:
                await page.goto(f"https://www.google.com/maps/search/{quote(query)}", wait_until="domcontentloaded", timeout=25000)
                await page.wait_for_selector('div[role="feed"]', timeout=15000)
            except Exception:
                continue

            sidebar = page.locator('div[role="feed"]')
            if await sidebar.count() > 0:
                for _ in range(12):
                    await sidebar.evaluate("el => el.scrollBy(0, 2000)")
                    await asyncio.sleep(0.4)

            cards = await page.locator('div[role="article"]').all()

            for card in cards:
                if inserted_leads_count >= TARGET_NEW_LEADS:
                    break

                try:
                    name_el = card.locator('div.qBF1Pd, a.hfT39').first
                    comp_name = (await name_el.inner_text()).strip() if await name_el.count() else await card.get_attribute("aria-label") or ""
                    clean_key = normalize_name(comp_name)

                    if not clean_key or clean_key in existing_names or is_unwanted_entity(comp_name):
                        continue

                    await card.click()
                    await asyncio.sleep(1.5)

                    website = None
                    web_btn = page.locator('a[data-tooltip*="website"], a[data-item-id*="authority"]').first
                    if await web_btn.count():
                        website = await web_btn.get_attribute('href')

                    # Priority 1: Google Search for Website if missing
                    if not website:
                        website = await search_website_on_google(context, comp_name)

                    raw_phone = "N/A"
                    
                    # Priority 2: Extract Phone from Website
                    if website:
                        raw_phone = await scrape_phone_from_website(context, website)

                    # Priority 3: Fallback to Maps Phone
                    if raw_phone == "N/A":
                        main_panel = page.locator('div[role="main"]').first
                        panel_text = await main_panel.inner_text() if await main_panel.count() else ""
                        phone_els = await page.locator('button[data-tooltip*="phone"], button[aria-label*="Phone"], button[data-item-id*="phone:"], a[href^="tel:"]').all()
                        
                        for p_el in phone_els:
                            val = (await p_el.get_attribute("aria-label") or "") + " " + (await p_el.get_attribute("data-item-id") or "") + " " + (await p_el.inner_text() or "")
                            match = re.search(r'(?:\+91[\s-]?)?[6-9]\d{9}|0\d{2,4}[\s-]?\d{6,8}', val)
                            if match:
                                raw_phone = match.group(0).strip()
                                break

                        if raw_phone == "N/A" and panel_text:
                            match = re.search(r'(?:\+91[\s-]?)?[6-9]\d{9}|0\d{2,4}[\s-]?\d{6,8}', panel_text)
                            if match:
                                raw_phone = match.group(0).strip()

                    formatted_phone, phone_type, is_wa, wa_link = classify_phone(raw_phone)

                    if formatted_phone == "N/A":
                        continue

                    phone_digits = re.sub(r"\D", "", formatted_phone)
                    if phone_digits in existing_phones:
                        continue

                    address = "Indore / Pithampur Zone"
                    addr_btn = page.locator('button[data-item-id="address"]').first
                    if await addr_btn.count():
                        address = (await addr_btn.inner_text()).replace('\n', ', ')

                    comb = (comp_name + " " + address + " " + query).lower()
                    detected_city = "Pithampur" if "pithampur" in comb else ("Dewas" if "dewas" in comb else "Indore")

                    lead_data = {
                        "company_name": comp_name,
                        "phone": formatted_phone,
                        "phone_type": phone_type,
                        "is_whatsapp": is_wa,
                        "whatsapp_link": wa_link,
                        "website": website,
                        "location": address,
                        "city": detected_city,
                        "category": category,
                        "industry": INDUSTRY
                    }

                    supabase.table("active_leads").insert(lead_data).execute()

                    existing_names.add(clean_key)
                    existing_phones.add(phone_digits)
                    inserted_leads_count += 1

                    print(f"🚀 [STORED #{inserted_leads_count}] {comp_name} | Phone: {formatted_phone} | Source: {'Website' if website else 'Maps'}")

                except Exception:
                    continue

        await browser.close()
        print(f"\n🎉 Finished! Successfully inserted {inserted_leads_count} Pharma Manufacturing leads.")

if __name__ == "__main__":
    asyncio.run(scrape_all_leads())