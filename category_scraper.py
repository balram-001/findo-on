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
# 1. SETUP & SUPABASE INITIALIZATION
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
    print("❌ Error: Supabase URL ya API Key missing hai!")
    sys.exit(1)

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

# ==========================================
# 2. PACKAGING & PLASTICS TARGET QUERIES
# ==========================================
INDUSTRY = "Packaging, Plastics & Paper Manufacturing"
TARGET_NEW_LEADS = 50

PACKAGING_QUERIES = [
    # Pithampur Industrial Belt
    {"query": "Corrugated box manufacturers Pithampur Sector 1", "category": "Paper & Corrugated Packaging"},
    {"query": "HDPE bottle plastic moulding factory Pithampur Sector 3", "category": "Plastic Packaging & Bottles"},
    {"query": "Flexible packaging polybag manufacturers Pithampur SEZ", "category": "Flexible Packaging"},
    {"query": "Pharma packaging aluminium foil factory Pithampur", "category": "Pharma & Special Packaging"},
    {"query": "Pet bottle blow moulding plant Pithampur Kheda", "category": "Plastic Packaging & Bottles"},

    # Indore Industrial Zones (Sanwer Road, Palda, Polo Ground)
    {"query": "Corrugated box manufacturing unit Sanwer Road Indore", "category": "Paper & Corrugated Packaging"},
    {"query": "Plastic injection moulding factory Sanwer Road Sector B Indore", "category": "Plastic Packaging & Bottles"},
    {"query": "Printed carton box manufacturer Palda Indore", "category": "Paper & Corrugated Packaging"},
    {"query": "Flexible packaging pouch manufacturer Polo Ground Indore", "category": "Flexible Packaging"},
    {"query": "HDPE container factory Laxmibai Nagar Indore", "category": "Plastic Packaging & Bottles"},
    {"query": "Industrial packaging material suppliers Rau Pigdamber Indore", "category": "Industrial Packaging"},

    # Dewas & Extended Belts
    {"query": "Corrugated packaging factory Dewas Industrial Area", "category": "Paper & Corrugated Packaging"},
    {"query": "Plastic container packaging plant Dewas", "category": "Plastic Packaging & Bottles"}
]

random.shuffle(PACKAGING_QUERIES)

STRICT_REJECTS = [
    "medical store", "chemist shop", "hospital", "clinic", "pathology", 
    "diagnostic", "dawa bazar", "retail store", "grocery", "stationery",
    "institute", "college", "university", "school", "coaching"
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

# ==========================================
# 3. SCRAPING ENGINE
# ==========================================
async def scrape_packaging_leads():
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

        for q_data in PACKAGING_QUERIES:
            if inserted_leads_count >= TARGET_NEW_LEADS:
                break

            query = q_data["query"]
            category = q_data["category"]
            print(f"🔎 [SEARCHING PACKAGING] '{query}'")

            try:
                await page.goto(f"https://www.google.com/maps/search/{quote(query)}", wait_until="domcontentloaded", timeout=25000)
                await page.wait_for_selector('div[role="feed"]', timeout=15000)
            except Exception:
                print("    ⏩ Timeout loading feed, skipping...\n")
                continue

            sidebar = page.locator('div[role="feed"]')
            if await sidebar.count() > 0:
                for _ in range(15):
                    await sidebar.evaluate("el => el.scrollBy(0, 2000)")
                    await asyncio.sleep(0.4)

            cards = await page.locator('div[role="article"]').all()
            print(f"   Found {len(cards)} listings on page.")

            for card in cards:
                if inserted_leads_count >= TARGET_NEW_LEADS:
                    break

                try:
                    name_el = card.locator('div.qBF1Pd, a.hfT39').first
                    comp_name = (await name_el.inner_text()).strip() if await name_el.count() else await card.get_attribute("aria-label") or ""
                    clean_key = normalize_name(comp_name)

                    if not clean_key or clean_key in existing_names:
                        continue

                    if is_unwanted_entity(comp_name):
                        print(f"    ❌ [SKIP UNWANTED] {comp_name}")
                        continue

                    await card.click()
                    await asyncio.sleep(2.0)

                    main_panel = page.locator('div[role="main"]').first
                    panel_text = await main_panel.inner_text() if await main_panel.count() else ""

                    # Extract Phone
                    raw_phone = "N/A"
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

                    # Website
                    website = None
                    web_btn = page.locator('a[data-tooltip*="website"], a[data-item-id*="authority"]').first
                    if await web_btn.count():
                        website = await web_btn.get_attribute('href')

                    if raw_phone == "N/A" and website:
                        site_tab = await context.new_page()
                        try:
                            await site_tab.goto(website, wait_until="domcontentloaded", timeout=4500)
                            site_text = (await site_tab.locator("body").inner_text())[:15000]
                            match = re.search(r'(?:\+91[\s-]?)?[6-9]\d{9}|0\d{2,4}[\s-]?\d{6,8}', site_text)
                            if match:
                                raw_phone = match.group(0).strip()
                        except Exception:
                            pass
                        finally:
                            await site_tab.close()

                    formatted_phone, phone_type, is_wa, wa_link = classify_phone(raw_phone)

                    if formatted_phone == "N/A":
                        print(f"    ❌ [NO PHONE] {comp_name}")
                        continue

                    phone_digits = re.sub(r"\D", "", formatted_phone)
                    if phone_digits in existing_phones:
                        print(f"    ⏩ [SKIP DUPLICATE PHONE] {comp_name}")
                        continue

                    address = "Indore / Pithampur Packaging Belt"
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

                    print("\n" + "=" * 60)
                    print(f"🚀 [PACKAGING STORED #{inserted_leads_count}] {comp_name}")
                    print(f"📞 Contact  : {formatted_phone} ({phone_type})")
                    print(f"💬 WhatsApp : {'Yes (' + wa_link + ')' if is_wa else 'No'}")
                    print(f"🌐 Website  : {website or 'N/A'}")
                    print(f"📍 City     : {detected_city}")
                    print("=" * 60 + "\n")

                except Exception:
                    continue

        await browser.close()

    print(f"\n🎉 Packaging Scrape Complete! Total {inserted_leads_count} unique leads inserted.")

if __name__ == "__main__":
    asyncio.run(scrape_packaging_leads())