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
  industries?: string[];
  category?: string;
  categories?: string[];
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

  if (targetIndustry === PACKAGING_INDUSTRY && rowIndustry === PHARMA_INDUSTRY.toLowerCase()) {
    return isPharmaPackagingLead(row);
  }

  if (allowedLabels) {
    return allowedLabels.some((label) => label.toLowerCase() === rowIndustry);
  }

  const searchableIndustryText = `${row.industry || ""} ${row.category || ""}`.toLowerCase();
  const allRowText = `${row.company_name || ""} ${searchableIndustryText}`.toLowerCase();
  const requiredKeywords = resolveIndustryKeywords(targetIndustry).map((keyword) => keyword.toLowerCase());
  const exclusionKeywords = INDUSTRY_EXCLUDE_MAP[targetIndustry] || [];

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

async function fetchLeadsForSingleIndustry(
  supabase: any,
  targetIndustry: string,
  city: string,
  perIndustryLimit: number,
  seenGlobalNames: Set<string>
) {
  const normalizedIndustry = targetIndustry.toLowerCase();
  const wantsAllIndustries = !targetIndustry || normalizedIndustry === "all" || normalizedIndustry === "all industries";
  const wantsAllCities = !city || city.toLowerCase() === "all" || city.toLowerCase() === "all cities";

  let dbQuery = supabase.from("active_leads").select("*", { count: "exact" });

  // 💡 FIX: Broad Partial Match (%city%) for both city & location column so sub-areas like Pithampur don't fail
  if (!wantsAllCities) {
    dbQuery = dbQuery.or(`city.ilike.%${city}%,location.ilike.%${city}%`);
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
  if (!industryHasNoValidFilter) {
    const result = await dbQuery
      .order("created_at", { ascending: false })
      .limit(Math.min(MAX_CANDIDATE_ROWS, perIndustryLimit * 5));
    rows = (result.data as LeadRow[]) || [];
  }

  const cleanLeads: Array<Record<string, unknown>> = [];

  rows.forEach((row, idx) => {
    const nameKey = (row.company_name || "").toLowerCase().trim();

    if (!nameKey || nameKey === "n/a") return;
    if (seenGlobalNames.has(nameKey)) return;
    if (!rowMatchesIndustry(row, targetIndustry, wantsAllIndustries)) return;

    seenGlobalNames.add(nameKey);

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

  return cleanLeads.slice(0, perIndustryLimit);
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

    let targetIndustries: string[] = [];
    if (Array.isArray(body.industries) && body.industries.length > 0) {
      targetIndustries = body.industries.map((s) => s.trim()).filter(Boolean);
    } else if (Array.isArray(body.categories) && body.categories.length > 0) {
      targetIndustries = body.categories.map((s) => s.trim()).filter(Boolean);
    } else {
      const single = body.industry?.trim() || body.category?.trim() || "";
      if (single) targetIndustries = [single];
    }

    const rawCity = body.city?.trim() || "";
    const city = rawCity ? sanitizeFilterValue(rawCity) : "";
    const requestedLimit = parseLimit(body.maxResults ?? body.limit);

    const supabaseUrl = getRequiredEnv("NEXT_PUBLIC_SUPABASE_URL");
    const serviceKey = getRequiredEnv("SUPABASE_SERVICE_ROLE_KEY");
    const supabase = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const isSingleOrAll = targetIndustries.length <= 1;
    let finalResult: Array<Record<string, unknown>> = [];

    if (isSingleOrAll) {
      const targetIndustry = targetIndustries[0] || "";
      const seenGlobalNames = new Set<string>();
      finalResult = await fetchLeadsForSingleIndustry(
        supabase,
        targetIndustry,
        city,
        requestedLimit,
        seenGlobalNames
      );
    } else {
      const perIndustryLimit = Math.max(1, Math.floor(requestedLimit / targetIndustries.length));
      const seenGlobalNames = new Set<string>();

      const results = await Promise.all(
        targetIndustries.map((ind) =>
          fetchLeadsForSingleIndustry(supabase, ind, city, perIndustryLimit, seenGlobalNames)
        )
      );

      finalResult = results.flat();
    }

    const executionTimeMs = Date.now() - startTime;

    return NextResponse.json({
      success: true,
      source: "supabase_db",
      data: finalResult,
      meta: {
        requested: requestedLimit,
        returned: finalResult.length,
        industry: targetIndustries.length > 0 ? targetIndustries.join(", ") : "All",
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