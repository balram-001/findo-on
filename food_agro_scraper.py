import os
import re
import time
import urllib.parse
import requests
from bs4 import BeautifulSoup
from playwright.sync_api import sync_playwright
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv(".env.local")

SUPABASE_URL = os.getenv("NEXT_PUBLIC_SUPABASE_URL", "").strip()
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "").strip()

if not SUPABASE_URL or not SUPABASE_KEY:
    SUPABASE_URL = "https://mdblmxeqkkctiqaxomzp.supabase.co"
    SUPABASE_KEY = "AAPKI_SERVICE_ROLE_KEY"

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

TARGET_TOTAL = 100
FIXED_INDUSTRY = "Food Processing & Agro Manufacturing"

# Deep Hyper-Local Agro & Food Processing Manufacturing Queries in Indore
REMAINING_FOOD_QUERIES = [
    ("Namkeen Cluster & Snacks Plant", "namkeen manufacturing unit namkeen cluster Sanwer Road Sector D Indore"),
    ("Soya Extraction & Lecithin Plant", "soya extraction soya lecithin refining manufacturing plant Palda Indore"),
    ("Poha, Puffed Rice & Grain Mills", "poha manufacturing mill factory Indore Bardari"),
    ("Industrial Flour & Besan Mills", "roller flour mill besan chana dal processing mill Sanwer Road Indore"),
    ("Spices Grinding & Blending Plants", "spices processing grinding manufacturing plant Siyaganj Nemawar Road Indore"),
    ("Cold Pressed Oils & Seed Crushing", "mustard groundnut oil mill processing manufacturing plant Indore"),
    ("Agro Dehydration & Powder Plant", "onion garlic powder dehydration processing factory Indore"),
    ("Cattle Feed & Animal Nutrition Plant", "cattle feed poultry feed mash pellet manufacturing plant Laxmibai Nagar Indore"),
    ("Dairy Products & Milk Processing", "paneer ghee milk processing packaging manufacturing dairy plant Indore"),
    ("Industrial Bakery, Rusk & Biscuits", "rusk toast biscuit automated bakery manufacturing plant Indore Polo Ground")
]

# Strict Discard List: Reject retail sweet shops, restaurants, kirana, cafes
EXCLUDE_TERMS = [
    "shop", "store", "retailer", "retail", "trader", "trading", "dealer", "dealership", 
    "showroom", "distributor", "wholesaler", "wholesale", "repair", "restaurant", 
    "hotel", "cafe", "dhaba", "fast food", "kirana", "sweet shop", "mithai", "bakery shop",
    "grocery", "bhojanalaya", "caterer", "sweets & namkeen retail"
]

def is_valid_food_manufacturer(name: str, category_tag: str) -> bool:
    combined = f"{name} {category_tag}".lower()
    for bad_word in EXCLUDE_TERMS:
        if re.search(rf"\b{bad_word}\b", combined):
            return False
    return True

def clean_phone_number(raw_str: str) -> str:
    if not raw_str:
        return "N/A"
    digits = re.sub(r"[^\d+]", "", raw_str)
    if digits.startswith("+91") and len(digits) == 13:
        return digits
    pure = re.sub(r"\D", "", raw_str)
    if len(pure) == 10 and pure[0] in "6789":
        return f"+91{pure}"
    if len(pure) == 11 and pure.startswith("0") and pure[1] in "6789":
        return f"+91{pure[1:]}"
    if len(pure) == 12 and pure.startswith("91"):
        return f"+{pure}"
    return raw_str.strip() if len(pure) >= 8 else "N/A"

def get_number_type(phone: str) -> str:
    if not phone or phone == "N/A":
        return "N/A"
    clean = re.sub(r"\D", "", phone)
    if clean.startswith("91"):
        clean = clean[2:]
    if len(clean) == 10 and clean[0] in "6789":
        return "Mobile / WhatsApp"
    elif clean.startswith("0731") or len(clean) >= 8:
        return "Landline"
    return "Office Line"

def scrape_website_for_contact(url: str):
    if not url or url == "N/A" or not url.startswith("http"):
        return None, None
    try:
        resp = requests.get(url, headers={"User-Agent": "Mozilla/5.0"}, timeout=4)
        if resp.status_code == 200:
            text = resp.text
            soup = BeautifulSoup(text, "html.parser")
            wa_match = re.search(r"(?:api\.whatsapp\.com/send\?phone=|wa\.me/)(\+?\d{10,13})", text, re.IGNORECASE)
            wa_num = clean_phone_number(wa_match.group(1)) if wa_match else None
            mobiles = re.findall(r"(?:(?:\+91|0)?[6-9]\d{9})", soup.get_text())
            mob_num = clean_phone_number(mobiles[0]) if mobiles else None
            return mob_num, wa_num
    except Exception:
        pass
    return None, None

def search_web_fallback(company_name: str):
    try:
        query = f"{company_name} Indore agro food processing plant contact phone"
        search_url = f"https://html.duckduckgo.com/html/?q={urllib.parse.quote_plus(query)}"
        resp = requests.get(search_url, headers={"User-Agent": "Mozilla/5.0"}, timeout=3)
        if resp.status_code == 200:
            phones = re.findall(r"(?:\+91[\-\s]?)?[6-9]\d{9}", resp.text)
            if phones:
                return clean_phone_number(phones[0])
    except Exception:
        pass
    return None

def complete_food_agro_to_100():
    print(f"Connecting to Supabase to verify existing leads under: {FIXED_INDUSTRY}...")
    existing = supabase.table("active_leads").select("company_name").eq("industry", FIXED_INDUSTRY).execute().data or []
    seen_names = set([r.get("company_name", "").lower().strip() for r in existing if r.get("company_name")])
    
    current_count = len(seen_names)
    needed = TARGET_TOTAL - current_count
    print(f"📊 Current Food & Agro Leads in Database : {current_count}")
    print(f"🎯 Fresh Leads Needed                    : {needed} (Target: {TARGET_TOTAL})\n" + "="*50)

    if needed <= 0:
        print("Target already achieved! 100 leads are in database.")
        return

    saved_session = 0

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=False, slow_mo=50)
        context = browser.new_context(viewport={"width": 1366, "height": 768})
        page = context.new_page()

        for category_name, query_str in REMAINING_FOOD_QUERIES:
            if (current_count + saved_session) >= TARGET_TOTAL:
                break

            print(f"\n🌾 Category: [{category_name}]")
            print(f"   Query   : {query_str}")

            maps_url = f"https://www.google.com/maps/search/{urllib.parse.quote_plus(query_str)}"
            try:
                page.goto(maps_url, timeout=20000)
                page.wait_for_timeout(2500)
            except Exception:
                continue

            try:
                feed = page.locator('div[role="feed"]').first
                if feed.is_visible(timeout=3000):
                    for _ in range(5):
                        feed.evaluate("el => el.scrollTop += 2000")
                        page.wait_for_timeout(900)
            except Exception:
                pass

            cards = page.locator('div[role="feed"] a[href*="/maps/place/"]').all()
            if not cards:
                cards = page.locator('a.hfpxzc').all()

            for card in cards:
                if (current_count + saved_session) >= TARGET_TOTAL:
                    break
                try:
                    card.click(timeout=3000)
                    page.wait_for_timeout(1200)

                    # 1. Company Name
                    name_el = page.locator('h1.DUwDvf').first
                    if not name_el.is_visible(timeout=1500):
                        continue
                    company_name = re.sub(r"\s+", " ", name_el.inner_text()).strip()

                    norm_name = company_name.lower().strip()
                    if norm_name in seen_names or "results" in norm_name or len(company_name) < 3:
                        continue

                    # 2. Strict Filter Check
                    category_tag = ""
                    cat_btn = page.locator('button[jsaction*="category"]').first
                    if cat_btn.is_visible(timeout=800):
                        category_tag = cat_btn.inner_text().strip()

                    if not is_valid_food_manufacturer(company_name, category_tag):
                        print(f"  ❌ Skipped Retail/Shop: {company_name}")
                        continue

                    # 3. Exact Map Address
                    addr_btn = page.locator('button[data-item-id="address"]').first
                    location_text = "Indore, Madhya Pradesh"
                    if addr_btn.is_visible(timeout=1000):
                        raw_addr = addr_btn.inner_text().replace("Address:", "").replace("Directions", "").strip()
                        raw_addr = re.sub(r"^[^a-zA-Z0-9]+", "", raw_addr)
                        if len(raw_addr) > 8:
                            location_text = raw_addr

                    # Strict Indore Validation
                    addr_lower = (location_text + " " + company_name).lower()
                    if any(x in addr_lower for x in ["pithampur", "dhar", "dewas", "ujjain", "bhopal"]):
                        continue

                    # 4. Website
                    website = "N/A"
                    web_btn = page.locator('a[data-item-id="authority"]').first
                    if web_btn.is_visible(timeout=800):
                        href = web_btn.get_attribute("href")
                        if href and href.startswith("http"):
                            website = href

                    # 5. Maps Phone
                    map_phone = "N/A"
                    phone_btn = page.locator('button[data-item-id*="phone"]').first
                    if phone_btn.is_visible(timeout=800):
                        map_phone = clean_phone_number(phone_btn.inner_text())

                    final_phone = "N/A"
                    whatsapp_link = "N/A"

                    # 1st Priority: Website
                    site_mob, site_wa = scrape_website_for_contact(website)
                    if site_mob:
                        final_phone = site_mob
                    if site_wa:
                        whatsapp_link = f"https://wa.me/{site_wa.replace('+', '')}"

                    # 2nd Priority: Web Search Fallback
                    if final_phone == "N/A":
                        web_mob = search_web_fallback(company_name)
                        if web_mob:
                            final_phone = web_mob

                    # 3rd Priority: Maps Phone
                    if final_phone == "N/A":
                        final_phone = map_phone

                    num_type = get_number_type(final_phone)
                    if whatsapp_link == "N/A" and num_type == "Mobile / WhatsApp":
                        whatsapp_link = f"https://wa.me/{final_phone.replace('+', '')}"

                    row_data = {
                        "company_name": company_name,
                        "industry": FIXED_INDUSTRY,
                        "category": category_name,
                        "phone": final_phone,
                        "phone_type": num_type,
                        "website": website,
                        "location": location_text,
                        "city": "Indore",
                        "whatsapp_link": whatsapp_link,
                        "created_at": "now()"
                    }

                    supabase.table("active_leads").upsert(
                        row_data,
                        on_conflict="company_name,city,phone"
                    ).execute()

                    seen_names.add(norm_name)
                    saved_session += 1
                    total_now = current_count + saved_session

                    print(f"[{total_now}/{TARGET_TOTAL}] 🌾 {company_name}")
                    print(f"    🏭 Industry    : {FIXED_INDUSTRY}")
                    print(f"    🏷️ Category    : {category_name}")
                    print(f"    📞 Phone       : {final_phone} ({num_type})")
                    print(f"    🌐 Website     : {website}")
                    print(f"    📍 Location    : {location_text}\n")

                except Exception:
                    continue

        browser.close()
        print(f"\n🎉 Target Completed! Total {current_count + saved_session} verified Food Processing & Agro Manufacturing leads saved.")

if __name__ == "__main__":
    complete_food_agro_to_100()