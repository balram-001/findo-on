import os
import re
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

TARGET_LEADS = 20
INDUSTRY_NAME = "Pharmaceuticals & Healthcare Manufacturing"

# 14+ Broad & High-Yield Pharma Manufacturing Queries for Indore Clusters
EXPANDED_PHARMA_QUERIES = [
    ("Pharmaceutical Formulations & Tablets", "pharmaceutical manufacturers Sanwer Road Indore"),
    ("Sterile Injectables & Liquid Orals", "pharma formulation plant Indore"),
    ("Ayurvedic & Herbal Formulations", "ayurvedic medicine manufacturers Indore"),
    ("Bulk Drugs & Active Intermediates", "bulk drug pharma chemicals manufacturing Indore"),
    ("Ayurvedic & Herbal Extracts", "herbal extract manufacturer Sanwer Road Indore"),
    ("Surgical & Medical Disposables", "surgical dressing bandage manufacturer Indore"),
    ("Homeopathic & Natural Remedies", "homeopathic medicine manufacturing laboratory Indore"),
    ("Veterinary Formulations", "veterinary pharmaceuticals manufacturing plant Indore"),
    ("Nutraceuticals & Health Supplements", "nutraceutical dietary supplements manufacturer Indore"),
    ("Cosmeceuticals & Derma Products", "cosmetic pharma manufacturing plant Indore"),
    ("Pharma Liquid Orals & Syrups", "liquid orals pharmaceutical laboratory Polo Ground Indore"),
    ("Pharma Cleanroom & Medical Devices", "medical device disposables manufacturer Indore"),
    ("Ayurvedic Oils & Churna Factory", "ayurvedic pharmacy manufacturing unit Palda Indore"),
    ("Pharmaceutical Contract Manufacturers", "pharma third party manufacturing Indore")
]

EXCLUDE_TERMS = [
    "retail shop", "medical store", "pharmacy", "clinic", "hospital",
    "doctor", "pathology", "diagnostic", "chemist shop", "kirana", "hotel"
]

def is_valid_pharma_unit(name: str, category_tag: str) -> bool:
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

    try:
        resp = requests.get(url, headers=headers, timeout=4)
        if resp.status_code == 200:
            soup = BeautifulSoup(resp.text, "html.parser")
            for a_tag in soup.find_all("a", href=True):
                href = a_tag["href"].strip()
                text = a_tag.get_text().lower()
                if any(k in href.lower() or k in text for k in ["contact", "contact-us", "reach-us", "about-us"]):
                    c_url = urllib.parse.urljoin(url, href)
                    if c_url not in pages_to_check and c_url.startswith("http"):
                        pages_to_check.append(c_url)
                        break
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

            if not found_wa:
                wa_match = re.search(r"(?:api\.whatsapp\.com/send\?phone=|wa\.me/)(\+?\d{10,13})", text, re.IGNORECASE)
                if wa_match:
                    found_wa = clean_phone_number(wa_match.group(1))

            if not found_mob:
                for tel in soup.select('a[href^="tel:"]'):
                    cleaned = clean_phone_number(tel["href"].replace("tel:", ""))
                    if cleaned != "N/A":
                        found_mob = cleaned
                        break

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

def run_pharma_expanded():
    print("Connecting to Supabase to fetch existing leads for deduplication...")
    existing = supabase.table("active_leads").select("company_name, phone").execute().data or []
    
    seen_names = set([re.sub(r"\s+", " ", r.get("company_name", "").lower().strip()) for r in existing if r.get("company_name")])
    seen_phones = set([clean_phone_number(r.get("phone", "")) for r in existing if r.get("phone") and clean_phone_number(r.get("phone", "")) != "N/A"])

    print(f"Loaded {len(seen_names)} existing companies & {len(seen_phones)} unique phone records.")
    print(f"Target: Fetching {TARGET_LEADS} unique leads for [{INDUSTRY_NAME}]\n" + "="*65)

    saved_count = 0

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=False)
        context = browser.new_context(viewport={"width": 1366, "height": 768})
        page = context.new_page()

        for category_name, query_str in EXPANDED_PHARMA_QUERIES:
            if saved_count >= TARGET_LEADS:
                break

            print(f"\nSearching: {category_name} -> {query_str}")
            maps_url = f"https://www.google.com/maps/search/{urllib.parse.quote_plus(query_str)}"
            
            try:
                page.goto(maps_url, timeout=25000)
                page.wait_for_timeout(3000)
            except Exception:
                continue

            try:
                feed = page.locator('div[role="feed"]').first
                if feed.is_visible(timeout=4000):
                    for _ in range(4):
                        feed.evaluate("el => el.scrollTop += 1800")
                        page.wait_for_timeout(900)
            except Exception:
                pass

            cards = page.locator('a.hfpxzc').all()
            if not cards:
                cards = page.locator('div[role="feed"] a[href*="/maps/place/"]').all()

            for card in cards:
                if saved_count >= TARGET_LEADS:
                    break
                try:
                    card.click(timeout=3000)
                    page.wait_for_timeout(1500)

                    name_el = page.locator('h1.DUwDvf').first
                    if not name_el.is_visible(timeout=1500):
                        continue
                    company_name = re.sub(r"\s+", " ", name_el.inner_text()).strip()
                    norm_name = company_name.lower().strip()

                    if norm_name in seen_names or len(company_name) < 3:
                        continue

                    category_tag = ""
                    cat_btn = page.locator('button[jsaction*="category"]').first
                    if cat_btn.is_visible(timeout=800):
                        category_tag = cat_btn.inner_text().strip()

                    if not is_valid_pharma_unit(company_name, category_tag):
                        continue

                    addr_btn = page.locator('button[data-item-id="address"]').first
                    location_text = "Indore, Madhya Pradesh"
                    if addr_btn.is_visible(timeout=800):
                        raw_addr = addr_btn.inner_text().replace("Address:", "").replace("Directions", "").strip()
                        raw_addr = re.sub(r"^[^a-zA-Z0-9]+", "", raw_addr)
                        if len(raw_addr) > 5:
                            location_text = raw_addr

                    website = None
                    web_btn = page.locator('a[data-item-id="authority"]').first
                    if web_btn.is_visible(timeout=800):
                        href = web_btn.get_attribute("href")
                        if href and href.startswith("http"):
                            website = href

                    map_phone = "N/A"
                    phone_btn = page.locator('button[data-item-id*="phone"]').first
                    if phone_btn.is_visible(timeout=800):
                        map_phone = clean_phone_number(phone_btn.inner_text())

                    final_phone = "N/A"
                    whatsapp_link = "N/A"

                    # Crawl website Contact Us page
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
                        "industry": INDUSTRY_NAME,
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

                    saved_count += 1
                    print(f"[{saved_count}/{TARGET_LEADS}] Saved: {company_name}")
                    print(f"   Category: {category_name}")
                    print(f"   Phone   : {final_phone} ({num_type})")
                    print(f"   Website : {website or 'N/A'}\n")

                except Exception:
                    continue

        browser.close()
        print(f"\nFinished: Successfully added {saved_count} unique leads for Pharma & Healthcare.")

if __name__ == "__main__":
    run_pharma_expanded()