import os
import re
import time
from urllib.parse import urljoin, quote_plus

from bs4 import BeautifulSoup
from dotenv import load_dotenv
from supabase import create_client, Client
from playwright.sync_api import sync_playwright, TimeoutError as PlaywrightTimeoutError


# ============================================================
# CONFIG
# ============================================================

load_dotenv(".env.local")
load_dotenv(".env")

SUPABASE_URL = os.getenv("NEXT_PUBLIC_SUPABASE_URL")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
    raise RuntimeError(
        "❌ Supabase credentials missing.\n"
        "Check NEXT_PUBLIC_SUPABASE_URL and "
        "SUPABASE_SERVICE_ROLE_KEY."
    )

supabase: Client = create_client(
    SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY
)


# ============================================================
# SEARCH SETTINGS
# ============================================================

CITY = "Indore"
STATE = "Madhya Pradesh"

CATEGORY = "Textile Manufacturers"
INDUSTRY = "Textile Manufacturers"

SEARCH_QUERY = "textile manufacturers indore"

SEARCH_URL = (
    "https://dir.indiamart.com/search.mp?ss="
    + quote_plus(SEARCH_QUERY)
)

# Maximum number of scrolls
MAX_SCROLLS = 8

# Maximum profile pages to open
MAX_PROFILES = 50

# Delay between page actions
ACTION_DELAY = 1.5

# Persistent browser session
SESSION_DIR = os.path.join(
    os.getcwd(),
    ".indiamart_browser"
)


# ============================================================
# TEXT CLEANING
# ============================================================

def clean_text(value):
    if not value:
        return None

    value = re.sub(r"\s+", " ", str(value))
    value = value.strip()

    return value if value else None


def normalize_company_name(name):
    if not name:
        return ""

    name = name.lower()

    name = re.sub(
        r"[^a-z0-9]+",
        " ",
        name
    )

    name = re.sub(
        r"\s+",
        " ",
        name
    )

    return name.strip()


# ============================================================
# PHONE
# ============================================================

def clean_phone_number(raw_phone):

    if not raw_phone:
        return (
            "N/A",
            "Missing",
            False,
            None
        )

    raw_phone = str(raw_phone).strip()

    if raw_phone.upper() in [
        "N/A",
        "NA",
        "NONE",
        "-"
    ]:
        return (
            "N/A",
            "Missing",
            False,
            None
        )

    digits = re.sub(
        r"\D",
        "",
        raw_phone
    )

    # +91XXXXXXXXXX / 91XXXXXXXXXX
    if digits.startswith("91") and len(digits) >= 12:
        digits = digits[-10:]

    # Indian mobile number
    if (
        len(digits) == 10
        and digits[0] in "6789"
    ):
        formatted_phone = f"+91{digits}"

        whatsapp_link = (
            f"https://wa.me/91{digits}"
        )

        return (
            formatted_phone,
            "Mobile",
            True,
            whatsapp_link
        )

    # Numbers with extra prefix characters
    if len(digits) > 10:

        last_10 = digits[-10:]

        if last_10[0] in "6789":

            formatted_phone = (
                f"+91{last_10}"
            )

            whatsapp_link = (
                f"https://wa.me/91{last_10}"
            )

            return (
                formatted_phone,
                "Mobile",
                True,
                whatsapp_link
            )

    # Landline
    if len(digits) >= 8:
        return (
            digits,
            "Landline",
            False,
            None
        )

    return (
        "N/A",
        "Missing",
        False,
        None
    )


def extract_phone_numbers(text):

    if not text:
        return []

    patterns = [
        r"\+91[\s\-]?[6-9]\d{9}",
        r"91[\s\-]?[6-9]\d{9}",
        r"\b[6-9]\d{9}\b",
    ]

    found = []

    for pattern in patterns:

        matches = re.findall(
            pattern,
            text
        )

        for match in matches:

            digits = re.sub(
                r"\D",
                "",
                match
            )

            if (
                digits.startswith("91")
                and len(digits) >= 12
            ):
                digits = digits[-10:]

            if (
                len(digits) == 10
                and digits[0] in "6789"
            ):
                found.append(digits)

    return list(dict.fromkeys(found))


# ============================================================
# WEBSITE
# ============================================================

def extract_website(soup):

    blocked_domains = [
        "indiamart.com",
        "facebook.com",
        "instagram.com",
        "youtube.com",
        "linkedin.com",
        "twitter.com",
        "x.com",
        "google.com",
        "wa.me",
    ]

    for a in soup.find_all(
        "a",
        href=True
    ):

        href = a.get(
            "href",
            ""
        ).strip()

        if not href:
            continue

        href_lower = href.lower()

        if not href_lower.startswith(
            ("http://", "https://")
        ):
            continue

        if any(
            domain in href_lower
            for domain in blocked_domains
        ):
            continue

        return href

    return None


# ============================================================
# LOCATION / ADDRESS
# ============================================================

def extract_address(soup):

    keywords = [
        "address",
        "location",
        "office",
        "factory",
        "registered address",
        "works",
    ]

    for tag in soup.find_all(
        [
            "address",
            "div",
            "span",
            "p",
            "li"
        ]
    ):

        text = clean_text(
            tag.get_text(
                " ",
                strip=True
            )
        )

        if not text:
            continue

        lower = text.lower()

        if any(
            keyword in lower
            for keyword in keywords
        ):

            if 10 <= len(text) <= 500:
                return text

    return None


# ============================================================
# TEXTILE FILTER
# ============================================================

def is_textile_company(text):

    if not text:
        return False

    text = text.lower()

    textile_keywords = [
        "textile",
        "textiles",
        "garment",
        "garments",
        "fabric",
        "fabrics",
        "cloth",
        "clothing",
        "apparel",
        "cotton",
        "yarn",
        "weaving",
        "loom",
        "spinning",
        "knit",
        "knitted",
        "readymade",
        "uniform",
        "manufacturer",
        "manufacturing",
    ]

    return any(
        keyword in text
        for keyword in textile_keywords
    )


# ============================================================
# BAD COMPANY NAMES
# ============================================================

BAD_NAMES = {
    "exporters",
    "manufacturers",
    "manufacturer",
    "suppliers",
    "supplier",
    "textile manufacturers indore",
    "textile manufacturers",
    "verified supplier",
    "verified suppliers",
    "view number",
    "contact supplier",
    "send email",
    "get best price",
    "get quote",
    "read more",
    "see more",
}


def looks_like_real_company_name(name):

    if not name:
        return False

    cleaned = clean_text(name)

    if not cleaned:
        return False

    normalized = normalize_company_name(
        cleaned
    )

    if normalized in BAD_NAMES:
        return False

    # Avoid very generic search phrases
    if normalized.startswith(
        "textile manufacturers"
    ):
        return False

    if len(cleaned) < 3:
        return False

    if len(cleaned) > 150:
        return False

    return True


# ============================================================
# COMPANY NAME
# ============================================================

def extract_company_name(block):

    # Prefer headings
    for tag in block.find_all(
        [
            "h1",
            "h2",
            "h3",
            "h4",
            "strong"
        ]
    ):

        name = clean_text(
            tag.get_text(
                " ",
                strip=True
            )
        )

        if looks_like_real_company_name(
            name
        ):
            return name

    # Then anchors
    for tag in block.find_all(
        "a"
    ):

        name = clean_text(
            tag.get_text(
                " ",
                strip=True
            )
        )

        if looks_like_real_company_name(
            name
        ):
            return name

    return None


# ============================================================
# LEAD EXTRACTION
# ============================================================

def extract_lead_from_block(block):

    text = clean_text(
        block.get_text(
            " ",
            strip=True
        )
    )

    if not text:
        return None

    # Must contain textile-related information
    if not is_textile_company(text):
        return None

    company_name = extract_company_name(
        block
    )

    if not company_name:
        return None

    # Phone
    phones = extract_phone_numbers(
        text
    )

    phone = "N/A"
    phone_type = "Missing"
    is_whatsapp = False
    whatsapp_link = None

    if phones:

        (
            phone,
            phone_type,
            is_whatsapp,
            whatsapp_link
        ) = clean_phone_number(
            phones[0]
        )

    # Website
    website = extract_website(
        block
    )

    # Location
    location = extract_address(
        block
    )

    if not location:
        location = f"{CITY}, {STATE}"

    return {
        "company_name": company_name,
        "category": CATEGORY,
        "industry": INDUSTRY,
        "city": CITY,
        "phone": phone,
        "phone_type": phone_type,
        "is_whatsapp": is_whatsapp,
        "whatsapp_link": whatsapp_link,
        "website": website,
        "location": location,
    }


# ============================================================
# COMPANY CANDIDATES
# ============================================================

def extract_company_candidates(soup):

    candidates = []

    for a in soup.find_all(
        "a",
        href=True
    ):

        href = a.get(
            "href",
            ""
        ).strip()

        text = clean_text(
            a.get_text(
                " ",
                strip=True
            )
        )

        if not href or not text:
            continue

        if not looks_like_real_company_name(
            text
        ):
            continue

        href_lower = href.lower()

        # Only likely IndiaMART profile links
        profile_patterns = [
            "/company/",
            "/proddetail/",
            "/supplier/",
            "/business/",
        ]

        if not any(
            pattern in href_lower
            for pattern in profile_patterns
        ):
            continue

        full_url = urljoin(
            "https://www.indiamart.com",
            href
        )

        candidates.append({
            "name": text,
            "url": full_url,
        })

    # Deduplicate
    unique = {}

    for candidate in candidates:

        key = normalize_company_name(
            candidate["name"]
        )

        if not key:
            continue

        if key not in unique:
            unique[key] = candidate

    return list(
        unique.values()
    )


# ============================================================
# BROWSER
# ============================================================

def launch_browser(playwright):

    print(
        "🌐 Starting Chromium..."
    )

    context = (
        playwright.chromium
        .launch_persistent_context(
            SESSION_DIR,
            headless=False,

            viewport={
                "width": 1366,
                "height": 850,
            },

            locale="en-IN",

            timezone_id="Asia/Kolkata",

            accept_downloads=False,
        )
    )

    return context


# ============================================================
# SCRAPE INDIA MART
# ============================================================

def scrape_with_playwright():

    scraped_leads = []

    with sync_playwright() as p:

        context = launch_browser(p)

        if context.pages:
            page = context.pages[0]
        else:
            page = context.new_page()

        print(
            "\n🔎 Opening IndiaMART:"
        )

        print(
            SEARCH_URL
        )

        try:

            page.goto(
                SEARCH_URL,
                wait_until="domcontentloaded",
                timeout=60000,
            )

        except PlaywrightTimeoutError:

            print(
                "⚠ Page load timeout. "
                "Continuing..."
            )

        time.sleep(3)

        # ----------------------------------------------------
        # PUBLIC PAGE ONLY
        # ----------------------------------------------------

        print(
            "\n📜 Loading public search results..."
        )

        for i in range(
            MAX_SCROLLS
        ):

            page.mouse.wheel(
                0,
                1800
            )

            time.sleep(
                ACTION_DELAY
            )

            print(
                f"   Scroll "
                f"{i + 1}/{MAX_SCROLLS}"
            )

        # ----------------------------------------------------
        # SEARCH HTML
        # ----------------------------------------------------

        html_content = page.content()

        soup = BeautifulSoup(
            html_content,
            "html.parser"
        )

        # ----------------------------------------------------
        # COMPANY PROFILES
        # ----------------------------------------------------

        candidates = (
            extract_company_candidates(
                soup
            )
        )

        print(
            f"\n🔍 Found "
            f"{len(candidates)} "
            f"possible company profiles."
        )

        # ----------------------------------------------------
        # SEARCH RESULT BLOCKS
        # ----------------------------------------------------

        all_blocks = soup.find_all(
            [
                "article",
                "li",
                "section",
            ]
        )

        print(
            "\n📦 Reading public result cards..."
        )

        for block in all_blocks:

            lead = extract_lead_from_block(
                block
            )

            if lead:
                scraped_leads.append(
                    lead
                )

        # ----------------------------------------------------
        # PROFILE PAGES
        # ----------------------------------------------------

        if candidates:

            print(
                "\n🏢 Reading public company pages..."
            )

        for index, candidate in enumerate(
            candidates[:MAX_PROFILES],
            1
        ):

            print(
                f"[{index}/{min(len(candidates), MAX_PROFILES)}] "
                f"{candidate['name']}"
            )

            profile_page = None

            try:

                profile_page = (
                    context.new_page()
                )

                profile_page.goto(
                    candidate["url"],
                    wait_until="domcontentloaded",
                    timeout=45000,
                )

                time.sleep(
                    ACTION_DELAY
                )

                profile_html = (
                    profile_page.content()
                )

                profile_soup = (
                    BeautifulSoup(
                        profile_html,
                        "html.parser"
                    )
                )

                lead = (
                    extract_lead_from_block(
                        profile_soup
                    )
                )

                if lead:

                    # Use candidate name if
                    # profile heading is missing
                    if not lead.get(
                        "company_name"
                    ):
                        lead[
                            "company_name"
                        ] = candidate["name"]

                    scraped_leads.append(
                        lead
                    )

            except PlaywrightTimeoutError:

                print(
                    "   ⚠ Profile timeout"
                )

            except Exception as e:

                print(
                    f"   ⚠ Profile error: {e}"
                )

            finally:

                if profile_page:

                    profile_page.close()

        context.close()

    # ========================================================
    # DEDUPLICATION
    # ========================================================

    unique_leads = {}

    for lead in scraped_leads:

        company = (
            normalize_company_name(
                lead.get(
                    "company_name"
                )
            )
        )

        if not company:
            continue

        if company not in unique_leads:

            unique_leads[
                company
            ] = lead

        else:

            existing = (
                unique_leads[
                    company
                ]
            )

            # Fill missing fields
            # from another occurrence
            for key in [
                "phone",
                "website",
                "location",
            ]:

                existing_value = (
                    existing.get(key)
                )

                new_value = (
                    lead.get(key)
                )

                if (
                    not existing_value
                    or existing_value == "N/A"
                ) and new_value:

                    existing[key] = new_value

    final_leads = list(
        unique_leads.values()
    )

    print(
        f"\n✅ Extracted "
        f"{len(final_leads)} "
        f"unique textile leads."
    )

    # Preview before database
    print(
        "\n---------------- LEAD PREVIEW ----------------"
    )

    for lead in final_leads:

        print(
            f"\n🏢 {lead['company_name']}"
        )

        print(
            f"   📞 {lead['phone']}"
        )

        print(
            f"   🌐 {lead['website'] or 'N/A'}"
        )

        print(
            f"   📍 {lead['location']}"
        )

    print(
        "\n-----------------------------------------------"
    )

    return final_leads


# ============================================================
# SUPABASE DUPLICATE CHECK
# ============================================================

def lead_already_exists(lead):

    company_name = lead.get(
        "company_name"
    )

    phone = lead.get(
        "phone"
    )

    try:

        # ----------------------------------------------------
        # Company check
        # ----------------------------------------------------

        if company_name:

            result = (
                supabase
                .table("active_leads")
                .select(
                    "id, company_name, phone"
                )
                .ilike(
                    "company_name",
                    company_name
                )
                .limit(10)
                .execute()
            )

            if result.data:

                new_normalized = (
                    normalize_company_name(
                        company_name
                    )
                )

                for existing in (
                    result.data
                ):

                    existing_normalized = (
                        normalize_company_name(
                            existing.get(
                                "company_name"
                            )
                        )
                    )

                    if (
                        new_normalized
                        == existing_normalized
                    ):
                        return True

        # ----------------------------------------------------
        # Phone check
        # ----------------------------------------------------

        if (
            phone
            and phone != "N/A"
        ):

            result = (
                supabase
                .table("active_leads")
                .select("id")
                .eq(
                    "phone",
                    phone
                )
                .limit(1)
                .execute()
            )

            if result.data:
                return True

    except Exception as e:

        print(
            f"⚠ Duplicate check error: {e}"
        )

    return False


# ============================================================
# SAVE TO SUPABASE
# ============================================================

def save_leads_to_supabase(
    leads
):

    new_added_count = 0
    skipped_count = 0
    error_count = 0

    print(
        "\n💾 Saving leads to Supabase...\n"
    )

    for lead in leads:

        company_name = lead.get(
            "company_name",
            "Unknown"
        )

        try:

            # Duplicate
            if lead_already_exists(
                lead
            ):

                skipped_count += 1

                print(
                    f"⚠ Skipped duplicate: "
                    f"{company_name}"
                )

                continue

            # Insert
            response = (
                supabase
                .table("active_leads")
                .insert(lead)
                .execute()
            )

            if response.data:

                new_added_count += 1

                print(
                    f"✓ Added: "
                    f"{company_name} "
                    f"({lead.get('phone', 'N/A')})"
                )

            else:

                error_count += 1

                print(
                    f"⚠ Insert returned "
                    f"no data: "
                    f"{company_name}"
                )

        except Exception as db_error:

            error_count += 1

            print(
                f"❌ Database error for "
                f"{company_name}: "
                f"{db_error}"
            )

    # ========================================================
    # SUMMARY
    # ========================================================

    print(
        "\n"
        + "=" * 55
    )

    print(
        "🎉 INDIA MART SCRAPING FINISHED"
    )

    print(
        "=" * 55
    )

    print(
        f"🆕 New leads:  {new_added_count}"
    )

    print(
        f"⏭ Duplicates:  {skipped_count}"
    )

    print(
        f"❌ Errors:      {error_count}"
    )

    print(
        "=" * 55
    )


# ============================================================
# MAIN
# ============================================================

if __name__ == "__main__":

    print("\n")

    print(
        "=" * 55
    )

    print(
        "     INDIA MART TEXTILE LEAD SCRAPER"
    )

    print(
        "=" * 55
    )

    print(
        f"📍 City:     {CITY}"
    )

    print(
        f"🏭 Category: {CATEGORY}"
    )

    print(
        "=" * 55
    )

    try:

        leads = (
            scrape_with_playwright()
        )

        if not leads:

            print(
                "\n⚠ No valid leads found."
            )

        else:

            save_leads_to_supabase(
                leads
            )

    except KeyboardInterrupt:

        print(
            "\n\n🛑 Scraper stopped by user."
        )

    except Exception as e:

        print(
            f"\n❌ Fatal error: {e}"
        )