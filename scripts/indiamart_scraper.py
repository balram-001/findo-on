import os
import re
import requests
from bs4 import BeautifulSoup
from supabase import create_client, Client

# 1. Supabase Configuration (Apni Keys Yahan Replace Karein)
SUPABASE_URL = "YOUR_NEXT_PUBLIC_SUPABASE_URL"
SUPABASE_SERVICE_ROLE_KEY = "YOUR_SUPABASE_SERVICE_ROLE_KEY"

# Initialize Supabase Client
supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

# Custom Headers to prevent getting blocked by IndiaMART
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept-Language": "en-US,en;q=0.9",
    "Referer": "https://www.google.com/",
}

def clean_phone_number(raw_phone):
    """
    Extracts 10-digit mobile number, checks type and generates WhatsApp link.
    """
    if not raw_phone or raw_phone == "N/A":
        return "N/A", "Missing", False, None

    # Extract digits only
    digits = re.sub(r"\D", "", str(raw_phone))

    # Check if valid Indian Mobile Number (10 digits starting with 6-9 or prefixed with 91/0)
    if len(digits) >= 10:
        mobile_10 = digits[-10:] # Take last 10 digits
        if re.match(r"^[6-9]\d{9}$", mobile_10):
            formatted_phone = f"+91{mobile_10}"
            whatsapp_link = f"https://wa.me/91{mobile_10}"
            return formatted_phone, "Mobile", True, whatsapp_link

    # Fallback for Landline numbers
    if len(digits) >= 8:
        return digits, "Landline", False, None

    return "N/A", "Missing", False, None


def scrape_indiamart_indore_textile():
    # Target Target URL for Indore Textile Manufacturers
    url = "https://dir.indiamart.com/indore/textile-manufacturers.html"
    
    print("Fetching page from IndiaMART...")
    try:
        response = requests.get(url, headers=HEADERS, timeout=15)
        if response.status_code != 200:
            print(f"Error: Page request failed with status code {response.status_code}")
            return
    except Exception as e:
        print(f"Network error: {e}")
        return

    soup = BeautifulSoup(response.text, "html.parser")
    
    # Extract all company listing cards
    cards = soup.find_all("div", class_="lst_cl")
    print(f"Found {len(cards)} listings on IndiaMART page.")

    scraped_leads = []

    for card in cards:
        try:
            # 1. Company Name
            company_elem = card.find("h2", class_="lcname") or card.find("a", class_="company-name")
            company_name = company_elem.get_text(strip=True) if company_elem else None
            
            if not company_name:
                continue

            # 2. Phone / Contact Extraction
            phone_elem = card.find("span", class_="pns_cn") or card.find("a", class_="cnct_btn")
            raw_phone = phone_elem.get_text(strip=True) if phone_elem else "N/A"
            phone, phone_type, is_whatsapp, wa_link = clean_phone_number(raw_phone)

            # 3. Location / Address
            address_elem = card.find("p", class_="mgl_lft") or card.find("span", class_="gloc")
            location = address_elem.get_text(strip=True) if address_elem else "Indore, Madhya Pradesh"

            # 4. Website Link
            website_elem = card.find("a", class_="pnam") or card.find("a", class_="company-url")
            website = website_elem["href"] if website_elem and "href" in website_elem.attrs else None
            
            if website and not website.startswith("http"):
                website = f"https://{website}"

            # Strictly set Category to Textile Manufacturers
            lead_obj = {
                "company_name": company_name,
                "category": "Textile Manufacturers",
                "industry": "Textile Manufacturers",
                "city": "Indore",
                "phone": phone,
                "phone_type": phone_type,
                "is_whatsapp": is_whatsapp,
                "whatsapp_link": wa_link,
                "website": website,
                "location": location,
            }

            scraped_leads.append(lead_obj)

        except Exception as err:
            print(f"Error parsing listing card: {err}")

    print(f"\nExtracted {len(scraped_leads)} parsed leads.")

    # Insert into Supabase with Deduplication check
    new_added_count = 0
    skipped_count = 0

    for lead in scraped_leads:
        try:
            # Check if company already exists in Supabase active_leads table
            res = supabase.table("active_leads").select("id").ilike("company_name", f"%{lead['company_name']}%").execute()
            
            if not res.data or len(res.data) == 0:
                supabase.table("active_leads").insert(lead).execute()
                new_added_count += 1
                print(f"✓ Added: {lead['company_name']} ({lead['phone']})")
            else:
                skipped_count += 1
                print(f"⚠ Skipped Duplicate: {lead['company_name']}")

        except Exception as db_err:
            print(f"Database insert error for {lead['company_name']}: {db_err}")

    print("\n--------------------------------------------------")
    print(f"🎉 Scraping Finished!")
    print(f"Added {new_added_count} new fresh leads.")
    print(f"Skipped {skipped_count} existing duplicate leads.")
    print("--------------------------------------------------")


if __name__ == "__main__":
    scrape_indiamart_indore_textile()