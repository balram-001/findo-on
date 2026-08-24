import os
import re
import urllib.parse
import requests
from bs4 import BeautifulSoup
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv(".env.local")

SUPABASE_URL = os.getenv("NEXT_PUBLIC_SUPABASE_URL", "").strip()
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "").strip()

if not SUPABASE_URL or not SUPABASE_KEY:
    SUPABASE_URL = "https://mdblmxeqkkctiqaxomzp.supabase.co"
    SUPABASE_KEY = "AAPKI_SERVICE_ROLE_KEY"

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

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

def scrape_deep_website_contact(url: str):
    if not url or not url.startswith("http"):
        return None, None

    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    }

    pages_to_check = [url]

    # 1. Discover Contact Page from Homepage Links
    try:
        resp = requests.get(url, headers=headers, timeout=5)
        if resp.status_code == 200:
            soup = BeautifulSoup(resp.text, "html.parser")
            for a_tag in soup.find_all("a", href=True):
                href = a_tag["href"].strip()
                text = a_tag.get_text().lower()
                if any(k in href.lower() or k in text for k in ["contact", "contact-us", "reach-us", "contactus"]):
                    contact_url = urllib.parse.urljoin(url, href)
                    if contact_url not in pages_to_check and contact_url.startswith("http"):
                        pages_to_check.append(contact_url)
                        break

            if len(pages_to_check) == 1:
                base_domain = f"{urllib.parse.urlsplit(url).scheme}://{urllib.parse.urlsplit(url).netloc}"
                pages_to_check.append(f"{base_domain}/contact-us")
                pages_to_check.append(f"{base_domain}/contact")
    except Exception:
        return None, None

    found_mobile = None
    found_wa = None

    # 2. Deep scan Homepage and Contact-Us page
    for target_url in pages_to_check:
        try:
            r = requests.get(target_url, headers=headers, timeout=5)
            if r.status_code != 200:
                continue

            page_text = r.text
            page_soup = BeautifulSoup(page_text, "html.parser")

            # WhatsApp Links
            if not found_wa:
                wa_match = re.search(r"(?:api\.whatsapp\.com/send\?phone=|wa\.me/)(\+?\d{10,13})", page_text, re.IGNORECASE)
                if wa_match:
                    found_wa = clean_phone_number(wa_match.group(1))

            # Direct 'tel:' links
            if not found_mobile:
                for tel_a in page_soup.select('a[href^="tel:"]'):
                    raw_tel = tel_a["href"].replace("tel:", "").strip()
                    cleaned = clean_phone_number(raw_tel)
                    if cleaned != "N/A" and re.sub(r"\D", "", cleaned).startswith(("91", "6", "7", "8", "9")):
                        found_mobile = cleaned
                        break

            # Regex search on visible text
            if not found_mobile:
                mobiles = re.findall(r"(?:(?:\+91|0)?[6-9]\d{9})", page_soup.get_text())
                for m in mobiles:
                    cleaned = clean_phone_number(m)
                    if cleaned != "N/A":
                        found_mobile = cleaned
                        break

            if found_mobile:
                break
        except Exception:
            continue

    return found_mobile, found_wa

def sync_leads():
    print("Connecting to Supabase...")
    all_leads = supabase.table("active_leads").select("id, company_name, website, phone, phone_type").execute().data or []
    
    target_leads = [
        lead for lead in all_leads
        if lead.get("website") 
        and lead.get("website").startswith("http") 
        and lead.get("phone_type") != "Mobile / WhatsApp"
    ]

    print(f"Total Leads with Website needing Mobile/WhatsApp upgrade: {len(target_leads)}\n" + "="*60)

    if not target_leads:
        print("All website leads already have verified Mobile / WhatsApp numbers!")
        return

    updated_count = 0

    for idx, lead in enumerate(target_leads, 1):
        lead_id = lead.get("id")
        company_name = lead.get("company_name")
        website = lead.get("website")
        current_phone = lead.get("phone") or "N/A"
        current_type = lead.get("phone_type") or "Missing"

        print(f"[{idx}/{len(target_leads)}] Checking: {company_name}")
        print(f"   URL          : {website}")
        print(f"   Current Phone: {current_phone} ({current_type})")

        found_mobile, found_wa = scrape_deep_website_contact(website)
        final_mobile = found_mobile or found_wa

        if final_mobile:
            whatsapp_link = f"https://wa.me/{final_mobile.replace('+', '')}"
            
            try:
                supabase.table("active_leads").update({
                    "phone": final_mobile,
                    "phone_type": "Mobile / WhatsApp",
                    "whatsapp_link": whatsapp_link
                }).eq("id", lead_id).execute()

                updated_count += 1
                print(f"   SUCCESS -> Updated to WhatsApp Mobile: {final_mobile}\n")

            except Exception as e:
                # Agar duplicate row error de raha hai toh empty/dummy row ko delete kar do
                if "duplicate key value" in str(e) or "23505" in str(e):
                    supabase.table("active_leads").delete().eq("id", lead_id).execute()
                    print(f"   MERGED -> Duplicate record cleaned up for {final_mobile}\n")
                else:
                    print(f"   FAILED -> {e}\n")
        else:
            print("   No direct mobile found on website (Kept current)\n")

    print("="*60)
    print(f"Sync Finished: {updated_count} leads successfully upgraded to Mobile/WhatsApp.")

if __name__ == "__main__":
    sync_leads()