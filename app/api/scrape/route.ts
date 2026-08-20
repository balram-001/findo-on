import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_RESULTS = 500;
const DEFAULT_LIMIT = 200;
const MAX_CANDIDATE_ROWS = 1_000;

type ApiRequest = {
  query?: string;
  industry?: string;
  category?: string;
  city?: string;
  limit?: number;
  maxResults?: number;
};

type LeadRow = {
  id?: string | number;
  company_name?: string;
  industry?: string;
  category?: string;
  phone?: string;
  phone_type?: string;
  is_whatsapp?: boolean;
  whatsapp_link?: string;
  website?: string;
  location?: string;
  city?: string;
  gstin?: string;
  gst_status?: string;
};

// Positive Keywords Map
const INDUSTRY_SEARCH_MAP: Record<string, string[]> = {
  "Automobile & Auto Components": [
    "Auto", "Automobile", "Forging", "Component", "Machining", "Vehicle", "Spare",
  ],
  "Pharmaceuticals & Healthcare Manufacturing": [
    "Pharma", "Pharmaceutical", "Health", "Medicine", "Drug", "API", "Formulation",
  ],
  "Chemical Manufacturing & Allied Industries": [
    "Chem", "Chemical", "Acid", "Solvent", "Polymer", "Resin", "Detergent", "Dye", "Adhesive", "Agrochem",
  ],
  "Packaging, Plastics & Paper Manufacturing": [
    "Packag", "Plastic", "Paper", "Corrugat", "Box", "Mould", "Bottle", "Pouch", "Film",
  ],
  "Food Processing & Agro Manufacturing": [
    "Food", "Agro", "Soya", "Grain", "Flour", "Oil", "Spice", "Snack", "Bakery", "Dairy",
  ],
};

// These are the database labels that belong to each dashboard option.  Use
// them as the primary guard: categories can overlap (for example, "Pharma
// Packaging"), but a lead's industry must not leak into another tab.
const INDUSTRY_LABEL_MAP: Record<string, string[]> = {
  "Automobile & Auto Components": ["Automobile & Auto Components"],
  "Pharmaceuticals & Healthcare Manufacturing": ["Pharmaceuticals & Healthcare Manufacturing"],
  "Chemical Manufacturing & Allied Industries": ["Chemical Manufacturing & Allied Industries"],
  "Packaging, Plastics & Paper Manufacturing": [
    "Packaging, Plastics & Paper Manufacturing",
    "Plastic & Polymer Industry",
  ],
  "Food Processing & Agro Manufacturing": ["Food Processing & Agro Manufacturing"],
};

const PACKAGING_INDUSTRY = "Packaging, Plastics & Paper Manufacturing";
const PHARMA_INDUSTRY = "Pharmaceuticals & Healthcare Manufacturing";
const PHARMA_PACKAGING_KEYWORDS = ["packag", "blister", "foil", "bottle", "carton", "label"];

// 💡 FIX: Negative Exclusion Map (Takes out cross-industry mixed leads like Edible Oil from Chemical)
const INDUSTRY_EXCLUDE_MAP: Record<string, string[]> = {
  "Chemical Manufacturing & Allied Industries": [
    "edible oil", "food", "food processing", "agro processing", "agriculture", "agricultural", "masala", "spice", "snack", "flour", "grain", "rice mill", "dal mill", "cold storage", "dairy", "bakery", "beverage", "catering", "restaurant", "hotel", "poultry", "animal feed", "cold chain"
  ],
  "Automobile & Auto Components": [
    "food", "pharma", "chemical", "paper", "packaging", "spices"
  ],
  "Pharmaceuticals & Healthcare Manufacturing": [
    "food", "snack", "spices", "automobile", "garment"
  ],
  "Packaging, Plastics & Paper Manufacturing": [
    "edible oil", "spices", "pharma formulation", "masala"
  ],
  "Food Processing & Agro Manufacturing": [
    "automobile", "pharma", "chemical dye", "industrial resin"
  ],
};

function getRequiredEnv(name: "NEXT_PUBLIC_SUPABASE_URL" | "SUPABASE_SERVICE_ROLE_KEY"): string {
  const val = process.env[name]?.trim();
  if (!val) throw new Error(`Missing environment variable: ${name}`);
  return val;
}

function parseLimit(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number.parseInt(String(value ?? DEFAULT_LIMIT), 10);
  return Number.isFinite(parsed) ? Math.min(Math.max(parsed, 1), MAX_RESULTS) : DEFAULT_LIMIT;
}

function sanitizeFilterValue(raw: string): string {
  return raw.replace(/[,().%_*\\]/g, "").trim();
}

function resolveIndustryKeywords(targetIndustry: string): string[] {
  const mapped = INDUSTRY_SEARCH_MAP[targetIndustry];
  if (mapped) return mapped;

  const cleaned = sanitizeFilterValue(targetIndustry);
  return cleaned
    .split(/\s+/)
    .map((w) => w.trim())
    .filter((w) => w.length >= 3);
}

function rowMatchesIndustry(row: LeadRow, targetIndustry: string, wantsAllIndustries: boolean): boolean {
  if (wantsAllIndustries) return true;

  const allowedLabels = INDUSTRY_LABEL_MAP[targetIndustry];
  const rowIndustry = (row.industry || "").toLowerCase().trim();

  // Some packaging suppliers are sourced via pharma-specific searches and are
  // labelled Pharma in the database. Keep them only when their category proves
  // they manufacture packaging—not medicines, APIs, or formulations.
  if (targetIndustry === PACKAGING_INDUSTRY && rowIndustry === PHARMA_INDUSTRY.toLowerCase()) {
    return isPharmaPackagingLead(row);
  }

  // Category labels overlap between verticals. A Pharma Packaging record, for
  // example, may contain "packaging" but it is still a Pharma lead. For the
  // dashboard's fixed industries, the saved industry label is authoritative.
  if (allowedLabels) {
    return allowedLabels.some((label) => label.toLowerCase() === rowIndustry);
  }

  const searchableIndustryText = `${row.industry || ""} ${row.category || ""}`.toLowerCase();
  const allRowText = `${row.company_name || ""} ${searchableIndustryText}`.toLowerCase();
  const requiredKeywords = resolveIndustryKeywords(targetIndustry).map((keyword) => keyword.toLowerCase());
  const exclusionKeywords = INDUSTRY_EXCLUDE_MAP[targetIndustry] || [];

  // The database query is intentionally broad to find variations such as
  // "industrial chemicals". Validate it again here so a mixed category cannot
  // leak into the result just because it contains one matching word.
  const hasIndustrySignal = requiredKeywords.some((keyword) => searchableIndustryText.includes(keyword));
  const hasExcludedSignal = exclusionKeywords.some((keyword) => allRowText.includes(keyword));

  return hasIndustrySignal && !hasExcludedSignal;
}

function isPharmaPackagingLead(row: LeadRow): boolean {
  const rowIndustry = (row.industry || "").toLowerCase().trim();
  const rowCategory = (row.category || "").toLowerCase();

  return rowIndustry === PHARMA_INDUSTRY.toLowerCase()
    && PHARMA_PACKAGING_KEYWORDS.some((keyword) => rowCategory.includes(keyword));
}

function getQueryIndustryLabels(targetIndustry: string): string[] | undefined {
  const labels = INDUSTRY_LABEL_MAP[targetIndustry];
  if (!labels) return undefined;

  return targetIndustry === PACKAGING_INDUSTRY
    ? [...labels, PHARMA_INDUSTRY]
    : labels;
}

function getAvailableResultLimit(requestedLimit: number): number {
  // Return the exact requested count whenever that many verified, unique
  // records exist. The final slice naturally returns fewer only when the
  // selected city/industry has fewer eligible records in the database.
  return requestedLimit;
}

export async function POST(request: Request) {
  const startTime = Date.now();

  try {
    let body: ApiRequest;
    try {
      body = (await request.json()) as ApiRequest;
    } catch {
      return NextResponse.json({ success: false, error: "Invalid JSON request body." }, { status: 400 });
    }

    const targetIndustry = body.industry?.trim() || body.category?.trim() || "";
    const rawCity = body.city?.trim() || "";
    const city = rawCity ? sanitizeFilterValue(rawCity) : "";
    const requestedLimit = parseLimit(body.maxResults ?? body.limit);
    const availableResultLimit = getAvailableResultLimit(requestedLimit);
    const normalizedIndustry = targetIndustry.toLowerCase();
    const wantsAllIndustries = !targetIndustry || normalizedIndustry === "all" || normalizedIndustry === "all industries";

    const supabaseUrl = getRequiredEnv("NEXT_PUBLIC_SUPABASE_URL");
    const serviceKey = getRequiredEnv("SUPABASE_SERVICE_ROLE_KEY");
    const supabase = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    let dbQuery = supabase.from("active_leads").select("*", { count: "exact" });

    if (city) {
      // City is the canonical normalized field. Do not use a loose location
      // search here: a Dewas/Pithampur address can mention Indore as nearby.
      dbQuery = dbQuery.ilike("city", city);
    }

    let industryHasNoValidFilter = false;

    if (!wantsAllIndustries) {
      const allowedLabels = getQueryIndustryLabels(targetIndustry);

      if (allowedLabels) {
        dbQuery = dbQuery.in("industry", allowedLabels);
      } else {
        const keywords = resolveIndustryKeywords(targetIndustry);

        if (keywords.length === 0) {
          industryHasNoValidFilter = true;
        } else {
          const conditions: string[] = [];
          keywords.forEach((kw) => {
            conditions.push(`industry.ilike.%${kw}%`);
            conditions.push(`category.ilike.%${kw}%`);
          });
          dbQuery = dbQuery.or(conditions.join(","));
        }
      }
    }

    let rows: LeadRow[] = [];
    let error: { message: string } | null = null;

    if (industryHasNoValidFilter) {
      rows = [];
    } else {
      const result = await dbQuery
        .order("created_at", { ascending: false })
        .limit(Math.min(MAX_CANDIDATE_ROWS, requestedLimit * 5)); // Buffer for strict quality filtering
      rows = (result.data as LeadRow[]) || [];
      error = result.error;
    }

    if (error) {
      console.error("Supabase Error:", error.message);
      return NextResponse.json({ success: false, error: `Database Error: ${error.message}` }, { status: 500 });
    }

    const seenNames = new Set<string>();
    const cleanLeads: Array<Record<string, unknown>> = [];

    rows.forEach((row, idx) => {
      const nameKey = (row.company_name || "").toLowerCase().trim();

      // A row without a company name cannot be a usable unique lead and would
      // later collapse into repeated "N/A" entries in the client.
      if (!nameKey || nameKey === "n/a") return;

      if (nameKey && seenNames.has(nameKey)) return;

      if (!rowMatchesIndustry(row, targetIndustry, wantsAllIndustries)) return;

      if (nameKey) seenNames.add(nameKey);

      const isSpecialPackagingLead = targetIndustry === PACKAGING_INDUSTRY && isPharmaPackagingLead(row);

      cleanLeads.push({
        id: row.id ?? idx + 1,
        companyName: row.company_name || "N/A",
        industry: isSpecialPackagingLead ? PACKAGING_INDUSTRY : row.industry || targetIndustry || "General Manufacturing",
        category: row.category || targetIndustry || "General",
        location: row.location || row.city || city || "Indore",
        phone: row.phone || "N/A",
        phoneType: row.phone_type || (row.phone ? "Mobile" : "Missing"),
        isWhatsapp: Boolean(row.is_whatsapp),
        website: row.website || undefined,
        gstin: row.gstin || undefined,
        gstStatus: row.gst_status || undefined,
        whatsappLink: row.whatsapp_link || undefined,
      });
    });

    // Return the requested count when available; never fabricate missing leads.
    const finalResult = cleanLeads.slice(0, availableResultLimit);
    const executionTimeMs = Date.now() - startTime;

    return NextResponse.json({
      success: true,
      source: "supabase_db",
      data: finalResult,
      meta: {
        requested: requestedLimit,
        resultLimit: availableResultLimit,
        returned: finalResult.length,
        industry: targetIndustry || "All",
        city: city || "All",
        executionTimeMs: `${executionTimeMs}ms`,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal Server Error";
    console.error("API Route Error:", message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
