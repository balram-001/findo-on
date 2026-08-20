import os
import re
import sys
from pathlib import Path
from dotenv import load_dotenv
from supabase import create_client, Client

# ==========================================
# 1. SUPABASE INITIALIZATION
# ==========================================
BASE_DIR = Path(__file__).resolve().parent
ENV_FILE = BASE_DIR / ".env.local" if (BASE_DIR / ".env.local").exists() else BASE_DIR / ".env"

if not ENV_FILE.exists():
    print("❌ Error: `.env` ya `.env.local` file nahi mili!")
    sys.exit(1)

load_dotenv(dotenv_path=ENV_FILE, override=True)

SUPABASE_URL = (os.getenv("NEXT_PUBLIC_SUPABASE_URL") or os.getenv("SUPABASE_URL") or "").strip()
SUPABASE_KEY = (os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("SUPABASE_KEY") or "").strip()

if not SUPABASE_URL or not SUPABASE_KEY:
    print("❌ Error: Supabase Credentials missing hain!")
    sys.exit(1)

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

# ==========================================
# 2. QUALIFICATION RULES
# ==========================================
# Target Sub-Categories mapping based on Company Name keywords
CATEGORY_RULES = {
    "Forging & Casting": [r"forge", r"forging", r"casting", r"cast", r"foundry", r"die cast"],
    "Precision Machining": [r"cnc", r"vmc", r"machin", r"tool", r"turning", r"precision", r"engineer"],
    "Sheet Metal & Body": [r"stamp", r"press", r"sheet metal", r"fabricat", r"metal"],
    "Fasteners & Hardware": [r"bolt", r"nut", r"fastener", r"screw", r"rivet"],
    "Rubber & Polymer": [r"rubber", r"plastic", r"polymer", r"mould", r"seal"],
    "Engine & Transmission": [r"gear", r"shaft", r"piston", r"engine", r"gasket", r"motor"],
    "Suspension & Brakes": [r"spring", r"steering", r"suspension", r"brake", r"clutch"]
}

def requalify_leads():
    print("🔄 Supabase se existing leads fetch ho rahe hain...\n")
    
    try:
        # Fetch all active leads
        res = supabase.table("active_leads").select("*").execute()
        leads = res.data or []
    except Exception as e:
        print(f"❌ DB Fetch Error: {e}")
        return

    print(f"📊 Total leads found in Database: {len(leads)}")
    updated_count = 0

    for lead in leads:
        lead_id = lead.get("id")
        comp_name = (lead.get("company_name") or "").lower()
        current_cat = lead.get("category")
        
        detected_category = None

        # Company name ko check karke matching category identify karna
        for cat_name, patterns in CATEGORY_RULES.items():
            if any(re.search(p, comp_name) for p in patterns):
                detected_category = cat_name
                break

        # Default fallback agar exact keyword na mile lekin generic/unqualified category ho
        if not detected_category:
            detected_category = "Auto Components"

        # Update tabhi run hoga jab category change ho rahi ho ya generic 'Unqualified' ho
        if detected_category != current_cat or current_cat in ["Unqualified", "N/A", None]:
            try:
                supabase.table("active_leads").update({
                    "category": detected_category,
                    "industry": "Automobile & Auto Components"
                }).eq("id", lead_id).execute()

                updated_count += 1
                print(f"✅ Re-qualified [{updated_count}]: '{lead.get('company_name')}'")
                print(f"   Old Category: {current_cat} ➔ New Category: [{detected_category}]\n")
            except Exception as e:
                print(f"⚠️ Failed to update {comp_name}: {e}")

    print("=" * 60)
    print(f"🎉 Re-qualification Completed! Total {updated_count} leads successfully updated.")

if __name__ == "__main__":
    requalify_leads()