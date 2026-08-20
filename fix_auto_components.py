import asyncio
import os
import re
import random
from pathlib import Path
from urllib.parse import quote

from dotenv import load_dotenv
from playwright.async_api import async_playwright
from supabase import create_client, Client

# ============================================================
# CONFIGURATION & ENV SETUP
# ============================================================
BASE_DIR = Path(__file__).resolve().parent
ENV_FILE = BASE_DIR / ".env" if (BASE_DIR / ".env").exists() else BASE_DIR / ".env.local"

if not ENV_FILE.exists():
    raise FileNotFoundError(f"Neither .env nor .env.local found in {BASE_DIR}")

load_dotenv(ENV_FILE, override=True)

SUPABASE_URL = os.getenv("NEXT_PUBLIC_SUPABASE_URL", "").strip()
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "").strip()

if not SUPABASE_URL or not SUPABASE_KEY:
    raise ValueError("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY")

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

INDUSTRY = "Automobile & Auto Components"
CITY = "Indore"
TARGET_NEW_LEADS = 50  # 50 Fresh Unique Leads Target

# Sub-Categories and their Exact Category Name Mapping
COMPONENT_CATEGORIES = {
    'automotive gear manufacturers': 'Gear Components',
    'automotive shaft manufacturers': 'Shaft & Transmission Components',
    'automotive forging plant': 'Forged Components',
    'automotive die casting plant': 'Casting Components',
    'automotive aluminium casting factory': 'Aluminium Casting Components',
    'automotive press parts manufacturers': 'Press & Stamping Parts',
    'automotive sheet metal stamping factory': 'Sheet Metal Components',
    'automotive CNC machined components manufacturers': 'Precision Machined Components',
    'automotive fastener manufacturers': 'Fasteners & Bolts',
    'automotive spring manufacturers': 'Suspension & Springs',
    'automotive rubber moulding components factory': 'Rubber Components',
    'automotive plastic injection moulding manufacturers': 'Plastic & Polymer Components',
    'automotive wiring harness manufacturers': 'Electrical & Wiring Harness',
    'automotive brake component manufacturers': 'Brake System Components',
    'automotive clutch component manufacturers': 'Clutch Components',
    'automotive steering component factory': 'Steering Components',
    'automotive radiator manufacturers': 'Cooling & Radiator Systems',
    'automotive exhaust system manufacturers': 'Exhaust Components',
    'automotive tier 1 tier 2 suppliers manufacturing': 'Tier 1/2 Ancillary Components'
}

LOCATION_VARIANTS = [
    'Pithampur Sector 1', 'Pithampur Sector 2', 'Pithampur Sector 3', 'Pithampur Sector 4',
    'Kheda Industrial Area Pithampur', 'Sanwer Road Industrial Area Indore',
    'Palda Industrial Area Indore', 'Dewas Industrial Area', 'Nimrani Industrial Area',
    'Rau Indore', 'Manglia Indore'
]

# Generate Query Pairs (Query String, Specific Category Name)
SEARCH_QUERY_OBJECTS = []
for _comp, _category in COMPONENT_CATEGORIES.items():
    for _loc in LOCATION_VARIANTS:
        SEARCH_QUERY_OBJECTS.append({
            "query": f"{_comp} in {_loc}",
            "category": _category
        })

# Shuffle queries so every execution gets a fresh order
random.shuffle(SEARCH_QUERY_OBJECTS)

INDIAN_STD_CODES = {"11", "22", "33", "44", "20", "40", "80", "79", "120", "731", "729", "7272", "755"}

# ============================================================
# PHONE EXTRACTION & CLASSIFICATION HELPERS
# ============================================================
PHONE_REGEXES = [
    r"(?:\+91[\s\-()]*)?[6-9]\d{4}[\s\-]?\d{5}",
    r"(?:0\d{2,4}[\s\-()]*)\d{5,8}",
    r"\b\d{3,5}[\s\-]\d{5,8}\b",
    r"(?:\+91[\s\-()]*)?[6-9]\d{9}"
]

def extract_phones_from_text(text: str):
    found = []
    for pattern in PHONE_REGEXES:
        for match in re.findall(pattern, text or ""):
            digits = re.sub(r"\D", "", match)
            if digits.startswith("91") and len(digits) > 10:
                digits = digits[2:]
            if 10 <= len(digits) <= 11 and digits not in found:
                found.append(digits)
    return found

def classify_phone(raw_phone: str):
    if not raw_phone:
        return "N/A", "Missing", False, None

    digits = re.sub(r"\D", "", str(raw_phone))
    if not digits:
        return "N/A", "Missing", False, None

    core = digits
    if core.startswith("91") and len(core) > 10:
        core = core[2:]
    core = re.sub(r"^0+", "", core)

    if len(core) == 10:
        for length in (4, 3, 2):
            if core[:length] in INDIAN_STD_CODES:
                return f"0{core}", "Landline", False, None
        if core[0] in "6789":
            return f"+91{core}", "Mobile", True, f"https://wa.me/91{core}"

    formatted = digits if digits.startswith("0") else f"0{core or digits}"
    return formatted, "Landline", False, None

def clean_name(name: str) -> str:
    name = (name or "").lower()
    remove_words = ["pvt", "ltd", "private", "limited", "company", "co", "indore", "pithampur", "dewas", "mfg", "works", "industry", "industries"]
    pattern = r"\b(" + "|".join(map(re.escape, remove_words)) + r")\b"
    name = re.sub(pattern, "", name)
    return re.sub(r"[^a-z0-9]", "", name)

# ============================================================
# STRICT MANUFACTURING FILTERS
# ============================================================
HARD_NEGATIVE_TERMS = [
    "garage", "workshop", "repair", "service center", "service centre", "dealer", 
    "dealership", "showroom", "retailer", "retail", "trader", "traders", "distributor", 
    "distributors", "spare parts shop", "spare parts dealer", "parts shop", "car decor", 
    "seat cover", "rental", "driving school", "tyre shop", "tire shop", "battery dealer", 
    "lubricant dealer", "mechanic", "accessories", "second hand", "wholesaler", "motor training",
    "vehicle manufacturing company", "automobile manufacturing company", "bus manufacturer", "truck manufacturer"
]

MANUFACTURING_TERMS = [
    "manufacturer", "manufacturers", "manufacturing", "factory", "plant", 
    "production facility", "oem", "press components", "foundry", "autocomp", "works", "engineering", "stamping", "forging", "casting"
]

AUTO_COMPONENT_TERMS = [
    "automotive", "automobile", "auto component", "auto components", "auto parts", 
    "forging", "casting", "stamping", "machining", "gear", "shaft", "fastener", "spring", "clutch", "brake", "rubber", "plastic"
]

INVALID_NAME_TERMS = {"results", "directions", "overview", "photos", "reviews", "search results", "google maps", "unknown"}

def invalid_company_name(name: str) -> bool:
    t = (name or "").lower().strip()
    if not t or t in INVALID_NAME_TERMS or len(t) < 3:
        return True
    if t.startswith("results") or t.endswith("results"):
        return True
    return False

def is_probable_auto_manufacturer(company_name: str, website_text: str = "", maps_text: str = ""):
    if invalid_company_name(company_name):
        return False

    text = f"{company_name} {website_text} {maps_text}".lower()

    if any(term in text for term in HARD_NEGATIVE_TERMS):
        return False

    has_mfg = any(term in text for term in MANUFACTURING_TERMS)
    has_auto = any(term in text for term in AUTO_COMPONENT_TERMS)

    return has_mfg and has_auto

# ============================================================
# SCRAPING & FALLBACK LOGIC
# ============================================================
async def search_website_on_google(page, company_name: str) -> str:
    """Fallback: Search Google Web if Maps does not provide an official website."""
    try:
        query = quote(f"{company_name} {CITY} official website")
        url = f"https://www.google.com/search?q={query}"
        await page.goto(url, wait_until="domcontentloaded", timeout=6000)
        
        links = await page.locator('div.g a').all()
        for link in links[:4]:
            href = await link.get_attribute("href")
            if href and href.startswith("http") and not any(ign in href for ign in ["google.", "facebook.", "linkedin.", "indiamart.", "justdial.", "mapquest."]):
                return href
    except Exception:
        pass
    return None

async def get_website_data(page, website_url: str):
    result = {"phone": None, "text": ""}
    if not website_url:
        return result

    try:
        await page.goto(website_url, wait_until="domcontentloaded", timeout=8000)
        body_text = await page.locator("body").inner_text(timeout=4000)
        result["text"] = body_text[:50000]

        tel_links = await page.locator('a[href^="tel:"]').all()
        for link in tel_links[:5]:
            href = await link.get_attribute("href")
            if href:
                extracted = extract_phones_from_text(href)
                if extracted:
                    formatted, _, _, _ = classify_phone(extracted[0])
                    if formatted != "N/A":
                        result["phone"] = formatted
                        return result

        candidates = extract_phones_from_text(body_text)
        if candidates:
            formatted, _, _, _ = classify_phone(candidates[0])
            if formatted != "N/A":
                result["phone"] = formatted
    except Exception:
        pass

    return result

async def extract_current_maps_detail(page, fallback_name: str):
    result = {"company_name": fallback_name, "address": None, "phone": None, "website": None, "maps_text": ""}
    
    try:
        title = page.locator("h1").first
        if await title.count():
            text = (await title.inner_text()).strip()
            if text and not invalid_company_name(text):
                result["company_name"] = text
    except Exception:
        pass

    try:
        loc = page.locator('button[data-item-id="address"], div[data-item-id="address"]').first
        if await loc.count():
            result["address"] = (await loc.inner_text()).strip()
    except Exception:
        pass

    phone_selectors = [
        'button[data-item-id^="phone:tel:"]',
        'a[href^="tel:"]',
        'button[aria-label*="Phone"]',
        'button[aria-label*="phone"]',
        'div[aria-label*="Phone"]'
    ]
    for selector in phone_selectors:
        try:
            loc = page.locator(selector).first
            if await loc.count():
                raw = await loc.inner_text() or await loc.get_attribute("href") or ""
                formatted, _, _, _ = classify_phone(raw)
                if formatted != "N/A":
                    result["phone"] = formatted
                    break
        except Exception:
            pass

    try:
        loc = page.locator('a[data-item-id="authority"], a[data-tooltip*="website"]').first
        if await loc.count():
            result["website"] = await loc.get_attribute("href")
    except Exception:
        pass

    try:
        body_text = (await page.locator("body").inner_text(timeout=3000))[:30000]
        result["maps_text"] = body_text
        
        if not result["phone"]:
            extracted = extract_phones_from_text(body_text)
            if extracted:
                formatted, _, _, _ = classify_phone(extracted[0])
                if formatted != "N/A":
                    result["phone"] = formatted
    except Exception:
        pass

    return result

def fetch_all_existing():
    response = supabase.table("active_leads").select("company_name,phone,website").execute()
    return response.data or []

# ============================================================
# MAIN DISCOVERY LOOP
# ============================================================
async def discover_new_leads(context, page, target_needed: int):
    existing = fetch_all_existing()
    existing_names = {clean_name(row.get("company_name") or "") for row in existing if row.get("company_name")}
    existing_phones = {re.sub(r"\D", "", str(row.get("phone") or "")) for row in existing if row.get("phone") and row.get("phone") != "N/A"}

    new_count = 0
    print(f"\n🚀 Starting Scraper | Target Goal: Adding {target_needed} BRAND NEW Unique Leads\n")

    for q_obj in SEARCH_QUERY_OBJECTS:
        if new_count >= target_needed:
            break

        query = q_obj["query"]
        specific_category = q_obj["category"]

        url = f"https://www.google.com/maps/search/{quote(query)}"
        try:
            print(f"🔍 Searching Query: {query} [Category: {specific_category}]")
            await page.goto(url, wait_until="domcontentloaded", timeout=15000)
            
            try:
                await page.wait_for_selector('div[role="article"]', timeout=7000)
            except Exception:
                print("   ⚠️ No initial listings loaded, moving to next query.")
                continue

            # Scroll Sidebar 8 Times for Deep Scraping
            sidebar = page.locator('div[role="feed"]')
            if await sidebar.count():
                for _ in range(8):
                    await sidebar.evaluate("el => el.scrollTop = el.scrollHeight")
                    await page.wait_for_timeout(600)

            articles = await page.locator('div[role="article"]').all()
            print(f"   📍 Found {len(articles)} total listings after deep scroll")

        except Exception as exc:
            print(f"   ⚠️ Query error: {exc}")
            continue

        for article in articles:
            if new_count >= target_needed:
                break

            try:
                name_el = article.locator("div.qBF1Pd, a.hfT39").first
                if not await name_el.count():
                    continue

                company = (await name_el.inner_text()).strip()
                
                if invalid_company_name(company):
                    continue

                cleaned_cname = clean_name(company)
                if cleaned_cname in existing_names:
                    print(f"   ⏩ Skip existing DB company: {company}")
                    continue

                link_el = article.locator("a.hfT39, div.qBF1Pd").first
                if await link_el.count():
                    await link_el.click()
                else:
                    await article.click()

                await page.wait_for_timeout(1800)

                maps = await extract_current_maps_detail(page, company)
                actual_name = maps["company_name"]

                if invalid_company_name(actual_name):
                    continue

                # Step 1: Website Logic (Maps Link -> Google Web Search Fallback)
                website = maps["website"]
                if not website:
                    web_tab = await context.new_page()
                    website = await search_website_on_google(web_tab, actual_name)
                    await web_tab.close()

                # Step 2: Website Phone Scraping
                website_data = {"phone": None, "text": ""}
                if website:
                    site_tab = await context.new_page()
                    website_data = await get_website_data(site_tab, website)
                    await site_tab.close()

                # Step 3: Priority Phone Allocation (Website Phone -> Maps Phone)
                chosen_phone = website_data["phone"] or maps["phone"] or "N/A"
                phone_formatted, phone_type, is_wa, wa_link = classify_phone(chosen_phone)

                if not phone_formatted or phone_formatted == "N/A":
                    print(f"   ❌ Skipped (No Phone Number): {actual_name}")
                    continue

                phone_digits = re.sub(r"\D", "", phone_formatted)
                if phone_digits and phone_digits in existing_phones:
                    print(f"   ⏩ Skip existing DB phone: {actual_name}")
                    continue

                # Step 4: Strict B2B Manufacturer Check
                if not is_probable_auto_manufacturer(actual_name, website_data["text"], maps["maps_text"]):
                    print(f"   ❌ Skipped (Non-Manufacturer/Dealer): {actual_name}")
                    continue

                # Dynamic Category Assignment Based on Search Intent
                record = {
                    "company_name": actual_name,
                    "phone": phone_formatted,
                    "phone_type": phone_type,
                    "is_whatsapp": is_wa,
                    "whatsapp_link": wa_link,
                    "website": website or None,
                    "location": maps["address"] or "Indore / Pithampur / Dewas",
                    "city": "Pithampur" if "pithampur" in query.lower() else ("Dewas" if "dewas" in query.lower() else "Indore"),
                    "category": specific_category,
                    "industry": INDUSTRY,
                }

                supabase.table("active_leads").insert(record).execute()

                existing_names.add(cleaned_cname)
                if phone_digits:
                    existing_phones.add(phone_digits)

                new_count += 1
                source = "Website" if website_data["phone"] else "Maps"
                print(f"   ✅ [{new_count}/{target_needed}] SAVED: {actual_name} | {phone_formatted} ({phone_type}/{source}) | Cat: {specific_category}")

            except Exception:
                continue

    return new_count

# ============================================================
# MAIN EXECUTION
# ============================================================
async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=False)
        context = await browser.new_context(viewport={"width": 1280, "height": 800})

        # Media & font blocking for high performance
        await context.route("**/*.{png,jpg,jpeg,svg,woff,woff2,gif,mp4,webp}", lambda route: route.abort())

        page = await context.new_page()

        try:
            await discover_new_leads(context, page, TARGET_NEW_LEADS)

        finally:
            await browser.close()

if __name__ == "__main__":
    asyncio.run(main())