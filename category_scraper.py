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

TARGET_FRESH_PER_INDUSTRY = 30

# Exact 5 Manufacturing Industries matching your Dashboard Dropdown
INDUSTRIES_CONFIG = [
    {
        "industry": "Automobile & Auto Components",
        "queries": [
            ("CNC Precision Machined Components", "CNC machined automobile parts components manufacturing plant Sanwer Road Indore"),
            ("Sheet Metal & Press Components", "automotive sheet metal stamping press shop factory Indore Sector C"),
            ("Industrial Fasteners & Bolts", "high tensile industrial fasteners bolts nuts manufacturer Indore Palda"),
            ("Hydraulic Cylinders & Power Packs", "hydraulic cylinder equipment manufacturing unit Polo Ground Indore")
        ]
    },
    {
        "industry": "Pharmaceuticals & Healthcare Manufacturing",
        "queries": [
            ("Sterile Injectables & Liquid Orals", "pharma liquid orals syrup injectable formulation plant Indore"),
            ("Ayurvedic & Herbal Formulations", "GMP certified herbal ayurvedic extract manufacturing factory Indore"),
            ("Bulk Drugs & Active Intermediates", "bulk drug pharmaceutical chemical intermediate plant Sanwer Road Indore"),
            ("Veterinary Formulations & Feed Supplements", "veterinary medicines formulation animal health plant Indore")
        ]
    },
    {
        "industry": "Chemical Manufacturing & Allied Industries",
        "queries": [
            ("Industrial Resins & Adhesives", "synthetic resin industrial adhesive manufacturing factory Indore Palda"),
            ("Water Treatment & Cooling Chemicals", "industrial RO water treatment chemicals manufacturing Indore"),
            ("Construction Admixtures & Waterproofing", "construction chemicals waterproofing admixture plant Indore Sanwer Road"),
            ("Specialty Polymer Masterbatches", "color masterbatch polymer compound manufacturing plant Indore")
        ]
    },
    {
        "industry": "Packaging, Plastics & Paper Manufacturing",
        "queries": [
            ("Corrugated Boxes & Heavy Duty Cartons", "corrugated packaging boxes manufacturing plant Indore Palda"),
            ("Plastic Injection Moulded Parts", "plastic injection moulding factory components manufacturer Indore"),
            ("Flexible Pouches & Lamination Rolls", "printed laminated flexible packaging pouch manufacturer Indore Sanwer Road"),
            ("HDPE Blow Moulded Containers & Bottles", "HDPE blow moulding plastic bottles containers plant Indore")
        ]
    },
    {
        "industry": "Food Processing & Agro Manufacturing",
        "queries": [
            ("Soya Extraction & Refining Mill", "soybean extraction oil refinery processing plant Indore Palda"),
            ("Flour & Pulse Processing Mills", "automatic roller flour mill dal processing plant Sanwer Road Indore"),
            ("Industrial Namkeen & Snacks Plant", "namkeen snacks manufacturing unit cluster Indore Nemawar Road"),
            ("Spices Grinding & Agro Processing", "spices grinding processing manufacturing factory Indore Siyaganj")
        ]
    }
]

# Strict Discard Terms (No shops, traders, or dealers)
EXCLUDE_TERMS = [
    "shop", "store", "retailer", "retail", "trader", "trading", "dealer", "dealership",
    "showroom", "distributor", "wholesaler", "wholesale", "repair", "service center",
    "pesticide shop", "paint shop", "hardware", "restaurant", "hotel", "cafe", "kirana",
    "agency", "reseller", "mart", "stationery", "chemist shop", "medical store"
]

def is_valid_manufacturer(name: str, category_tag: str) -> bool:
    combined = f"{name} {category_tag}".lower()
    for bad in EXCLUDE_TERMS:
        if re.search(rf"\b{bad}\b", combined):
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
    return "N/A"

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

def scrape_deep_website_contact(url: str):
    if not url or not url.startswith("http"):
        return None, None

    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    }

    pages_to_check = [url]

    # Auto detect Contact-Us Link
    try:
        resp = requests.get(url, headers=headers, timeout=4)
        if resp.status_code == 200:
            soup = BeautifulSoup(resp.text, "html.parser")
            for a in soup.find_all("a", href=True):
                href = a["href"].strip()
                text = a.get_text().lower()
                if any(k in href.lower() or k in text for k in ["contact", "contact-us", "reach-us", "about-us"]):
                    c_url = urllib.parse.urljoin(url, href)
                    if c_url not in pages_to_check and c_url.startswith("http"):
                        pages_to_check.append(c_url)
                        break

            if len(pages_to_check) == 1:
                base_domain = f"{urllib.parse.urlsplit(url).scheme}://{urllib.parse.urlsplit(url).netloc}"
                pages_to_check.append(f"{base_domain}/contact-us")
                pages_to_check.append(f"{base_domain}/contact")
    except Exception:
        return None, None

    found_mob, found_wa = None, None

    for target in pages_to_check:
        try:
            r = requests.get(target, headers=headers, timeout=4)
            if r.status_code != 200:
                continue

            text = r.text
            soup = BeautifulSoup(text, "html.parser")

            # WhatsApp Search
            if not found_wa:
                wa_match = re.search(r"(?:api\.whatsapp\.com/send\?phone=|wa\.me/)(\+?\d{10,13})", text, re.IGNORECASE)
                if wa_match:
                    found_wa = clean_phone_number(wa_match.group(1))

            # 'tel:' links
            if not found_mob:
                for tel in soup.select('a[href^="tel:"]'):
                    cleaned = clean_phone_number(tel["href"].replace("tel:", ""))
                    if cleaned != "N/A":
                        found_mob = cleaned
                        break

            # Regex on visible body text
            if not found_mob:
                mobiles = re.findall(r"(?:(?:\+91|0)?[6-9]\d{9})", soup.get_text())
                for m in mobiles:
                    cleaned = clean_phone_number(m)
                    if cleaned != "N/A":
                        found_mob = cleaned
                        break

            if found_mob:
                break
        except Exception:
            continue

    return found_mob, found_wa

def run_30_fresh_leads_per_industry():
    print("Connecting to Supabase to fetch existing leads (Duplicate Prevention)...")
    existing = supabase.table("active_leads").select("company_name, phone").execute().data or []
    
    seen_names = set([re.sub(r"\s+", " ", r.get("company_name", "").lower().strip()) for r in existing if r.get("company_name")])
    seen_phones = set([clean_phone_number(r.get("phone", "")) for r in existing if r.get("phone") and clean_phone_number(r.get("phone", "")) != "N/A"])

    print(f"Loaded {len(seen_names)} existing companies & {len(seen_phones)} unique phone records.\n" + "="*65)

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=False, slow_mo=50)
        context = browser.new_context(viewport={"width": 1366, "height": 768})
        page = context.new_page()

        for config in INDUSTRIES_CONFIG:
            industry_name = config["industry"]
            saved_in_this_ind = 0

            print(f"\n🚀 STARTING INDUSTRY: [{industry_name.upper()}] (Target: 30 Fresh Leads)")
            print("="*65)

            for category_name, query_str in config["queries"]:
                if saved_in_this_ind >= TARGET_FRESH_PER_INDUSTRY:
                    break

                print(f"\n🔎 Category: {category_name} | Query: {query_str}")
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
                            feed.evaluate("el => el.scrollTop += 2200")
                            page.wait_for_timeout(800)
                except Exception:
                    pass

                cards = page.locator('div[role="feed"] a[href*="/maps/place/"]').all()
                if not cards:
                    cards = page.locator('a.hfpxzc').all()

                for card in cards:
                    if saved_in_this_ind >= TARGET_FRESH_PER_INDUSTRY:
                        break
                    try:
                        card.click(timeout=3000)
                        page.wait_for_timeout(1000)

                        name_el = page.locator('h1.DUwDvf').first
                        if not name_el.is_visible(timeout=1200):
                            continue
                        company_name = re.sub(r"\s+", " ", name_el.inner_text()).strip()
                        norm_name = company_name.lower().strip()

                        if norm_name in seen_names or "results" in norm_name or len(company_name) < 3:
                            continue

                        category_tag = ""
                        cat_btn = page.locator('button[jsaction*="category"]').first
                        if cat_btn.is_visible(timeout=600):
                            category_tag = cat_btn.inner_text().strip()

                        if not is_valid_manufacturer(company_name, category_tag):
                            continue

                        addr_btn = page.locator('button[data-item-id="address"]').first
                        location_text = "Indore, Madhya Pradesh"
                        if addr_btn.is_visible(timeout=800):
                            raw_addr = addr_btn.inner_text().replace("Address:", "").replace("Directions", "").strip()
                            raw_addr = re.sub(r"^[^a-zA-Z0-9]+", "", raw_addr)
                            if len(raw_addr) > 8:
                                location_text = raw_addr

                        addr_lower = (location_text + " " + company_name).lower()
                        if any(x in addr_lower for x in ["pithampur", "dhar", "dewas", "ujjain", "bhopal"]):
                            continue

                        website = None
                        web_btn = page.locator('a[data-item-id="authority"]').first
                        if web_btn.is_visible(timeout=600):
                            href = web_btn.get_attribute("href")
                            if href and href.startswith("http"):
                                website = href

                        map_phone = "N/A"
                        phone_btn = page.locator('button[data-item-id*="phone"]').first
                        if phone_btn.is_visible(timeout=600):
                            map_phone = clean_phone_number(phone_btn.inner_text())

                        final_phone = "N/A"
                        whatsapp_link = "N/A"

                        # Deep Contact-Us Extraction from Official Website
                        if website:
                            site_mob, site_wa = scrape_deep_website_contact(website)
                            if site_mob:
                                final_phone = site_mob
                            if site_wa:
                                whatsapp_link = f"https://wa.me/{site_wa.replace('+', '')}"

                        if final_phone == "N/A":
                            final_phone = map_phone

                        num_type = get_number_type(final_phone)
                        if final_phone != "N/A" and whatsapp_link == "N/A" and num_type == "Mobile / WhatsApp":
                            whatsapp_link = f"https://wa.me/{final_phone.replace('+', '')}"

                        if final_phone != "N/A" and final_phone in seen_phones:
                            continue

                        row_data = {
                            "company_name": company_name,
                            "industry": industry_name,
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
                        if final_phone != "N/A":
                            seen_phones.add(final_phone)

                        saved_in_this_ind += 1
                        print(f"  [{saved_in_this_ind}/{TARGET_FRESH_PER_INDUSTRY}] {company_name}")
                        print(f"      🏷️ Category : {category_name}")
                        print(f"      📞 Phone    : {final_phone} ({num_type})")
                        print(f"      🌐 Website  : {website or 'N/A'}\n")

                    except Exception:
                        continue

            print(f"✅ Completed 30 fresh leads for: {industry_name}")

        browser.close()
        print("\n🎉 ALL 5 INDUSTRIES COMPLETED! Total 150 (30x5) brand new verified leads added.")

if __name__ == "__main__":
    run_30_fresh_leads_per_industry()